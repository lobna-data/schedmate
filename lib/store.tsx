'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { DataSet, Session, Teacher, Module, Group, Room, RoomType, Settings, rid } from './types';
import { demoData, demoSessions } from './demo';
import { generateSchedule } from './scheduler';

const KEY = 'schedmate-data-v1';

interface Store {
  ready: boolean;
  data: DataSet;
  sessions: Session[];
  saveTeacher: (t: Teacher) => void;
  saveModule: (m: Module) => void;
  saveGroup: (g: Group) => void;
  saveRoom: (r: Room) => void;
  removeTeacher: (id: string) => void;
  removeModule: (id: string) => void;
  removeGroup: (id: string) => void;
  removeRoom: (id: string) => void;
  saveSettings: (s: Settings) => void;
  setSessions: (s: Session[]) => void;
  moveSession: (id: string, day: string, slot: string) => string | null;
  assignRoom: (sessionId: string, roomId: string) => string | null;
  deleteSession: (id: string) => void;
  generate: () => void;
  importRows: (rows: { day: string; time: string; teacher: string; module: string; group: string; room: string }[]) => void;
  resetDemo: () => void;
  autoFix: boolean;
  lastFixes: string[];
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const initial = useRef<{ data: DataSet; sessions: Session[] }>(null as never);
  if (!initial.current) {
    const data = demoData();
    initial.current = { data, sessions: demoSessions(data) };
  }

  const [ready, setReady] = useState(false);
  const [data, setData] = useState<DataSet>(initial.current.data);
  const [sessions, setSessions] = useState<Session[]>(initial.current.sessions);
  const [autoFix, setAutoFix] = useState(true);
  const [lastFixes, setLastFixes] = useState<string[]>([]);

  // Load from browser storage once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.data?.settings && Array.isArray(parsed?.sessions)) {
          setData(parsed.data);
          setSessions(parsed.sessions);
        }
      }
    } catch { /* corrupted storage -> keep demo */ }
    setReady(true);
  }, []);

  // Persist on every change after the first load.
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify({ data, sessions })); } catch { /* quota */ }
  }, [data, sessions, ready]);

  // Auto-fix conflicts after every data change (when toggle is ON).
  useEffect(() => {
    if (!ready || !autoFix) return;
    const res = autofix(data, sessions);
    const changed = JSON.stringify(res.sessions) !== JSON.stringify(sessions);
    if (changed) {
      setSessions(res.sessions);
      if (res.fixes.length) setLastFixes(res.fixes);
    }
  }, [data, sessions, ready, autoFix]);

  const api: Store = {
    ready,
    data,
    sessions,

    saveTeacher: (t) => setData((d) => ({ ...d, teachers: upsert(d.teachers, t) })),
    saveModule: (m) => setData((d) => ({ ...d, modules: upsert(d.modules, m) })),
    saveGroup: (g) => setData((d) => ({ ...d, groups: upsert(d.groups, g) })),
    saveRoom: (r) => setData((d) => ({ ...d, rooms: upsert(d.rooms, r) })),

    removeTeacher: (id) => {
      setData((d) => ({
        ...d,
        teachers: d.teachers.filter((x) => x.id !== id),
        modules: d.modules.filter((m) => m.teacherId !== id),
      }));
      setSessions((ss) => ss.filter((s) => s.teacherId !== id));
    },
    removeModule: (id) => {
      setData((d) => ({ ...d, modules: d.modules.filter((x) => x.id !== id) }));
      setSessions((ss) => ss.filter((s) => s.moduleId !== id));
    },
    removeGroup: (id) => {
      setData((d) => ({
        ...d,
        groups: d.groups.filter((x) => x.id !== id),
        modules: d.modules.map((m) => ({ ...m, groupIds: m.groupIds.filter((g) => g !== id) })),
      }));
      setSessions((ss) => ss.filter((s) => s.groupId !== id));
    },
    removeRoom: (id) => {
      setData((d) => ({ ...d, rooms: d.rooms.filter((x) => x.id !== id) }));
      setSessions((ss) => ss.filter((s) => s.roomId !== id));
    },

    saveSettings: (s) => setData((d) => ({ ...d, settings: s })),
    setSessions,

    moveSession: (id, day, slot) => {
      const s = sessions.find((x) => x.id === id);
      if (!s) return 'Session not found.';
      const clash = sessions.find(
        (x) => x.id !== id && x.day === day && x.slot === slot &&
          (x.teacherId === s.teacherId || x.groupId === s.groupId || x.roomId === s.roomId),
      );
      if (clash) return `Move blocked: that slot already has a class (${day} ${slot}).`;
      const t = data.teachers.find((x) => x.id === s.teacherId);
      if (t && t.restricted && t.availability.length && !t.availability.includes(`${day}|${slot}`)) {
        return `Move blocked: ${t.name} is not available on ${day} ${slot}.`;
      }
      setSessions((ss) => ss.map((x) => (x.id === id ? { ...x, day, slot } : x)));
      return null;
    },

    assignRoom: (sessionId, roomId) => {
      const s = sessions.find((x) => x.id === sessionId);
      if (!s) return 'Session not found.';
      const clash = sessions.find((x) => x.id !== sessionId && x.day === s.day && x.slot === s.slot && x.roomId === roomId);
      if (clash) return 'Move blocked: that room is already booked at that time.';
      setSessions((ss) => ss.map((x) => (x.id === sessionId ? { ...x, roomId } : x)));
      return null;
    },

    deleteSession: (id) => setSessions((ss) => ss.filter((x) => x.id !== id)),

    generate: () => setSessions(generateSchedule(data)),

    importRows: (rows) => {
      const next: DataSet = {
        settings: data.settings,
        teachers: data.teachers.map((x) => ({ ...x })),
        modules: data.modules.map((x) => ({ ...x })),
        groups: data.groups.map((x) => ({ ...x })),
        rooms: data.rooms.map((x) => ({ ...x })),
      };
      const byName = <T extends { id: string; name: string }>(list: T[], name: string, make: () => T): T => {
        const hit = list.find((x) => x.name === name);
        if (hit) return hit;
        const item = make();
        list.push(item);
        return item;
      };
      for (const r of rows) {
        const teacher = byName(next.teachers, r.teacher, () => ({
          id: rid('t'), name: r.teacher, maxHours: 18, restricted: false, availability: [], prefSlots: [], notes: '',
        }));
        const group = byName(next.groups, r.group, () => ({ id: rid('g'), name: r.group, size: 30 }));
        byName(next.rooms, r.room, () => ({
          id: rid('r'), name: r.room, capacity: 40,
          type: (/lab/i.test(r.room) ? 'lab' : 'classroom') as RoomType,
        }));
        let mod = next.modules.find((x) => x.name === r.module && x.teacherId === teacher.id);
        if (!mod) {
          mod = {
            id: rid('m'), name: r.module, teacherId: teacher.id, hoursPerWeek: 0,
            groupIds: [], roomType: (/lab/i.test(r.room) ? 'lab' : 'classroom') as RoomType,
          };
          next.modules.push(mod);
        }
        if (!mod.groupIds.includes(group.id)) mod.groupIds = [...mod.groupIds, group.id];
      }
      // Required hours per module×group = number of rows imported.
      const countRows = (moduleName: string, groupName: string) =>
        rows.filter((r) => r.module === moduleName && r.group === groupName).length;
      for (const m of next.modules) {
        if (!m.groupIds.length) continue;
        m.hoursPerWeek = Math.max(
          ...m.groupIds.map((gid) => countRows(m.name, next.groups.find((g) => g.id === gid)?.name ?? '')),
          0,
        );
      }
      // Adopt the days/slots found in the file so every row stays visible.
      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const days = Array.from(new Set(rows.map((r) => r.day))).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
      const slotStart = (s: string) => s.split(/[–-]/)[0].trim();
      const slots = Array.from(new Set(rows.map((r) => r.time))).sort((a, b) => slotStart(a).localeCompare(slotStart(b)));
      if (days.length) next.settings = { ...next.settings, days };
      if (slots.length) next.settings = { ...next.settings, slots };

      const findId = (list: { id: string; name: string }[], name: string) => list.find((x) => x.name === name)?.id ?? '';
      const imported: Session[] = [];
      for (const r of rows) {
        const teacherId = findId(next.teachers, r.teacher);
        const groupId = findId(next.groups, r.group);
        const roomId = findId(next.rooms, r.room);
        const mod = next.modules.find((x) => x.name === r.module && x.teacherId === teacherId);
        if (!teacherId || !groupId || !roomId || !mod) continue;
        imported.push({ id: rid('s'), day: r.day, slot: r.time, teacherId, moduleId: mod.id, groupId, roomId });
      }
      setData(next);
      setSessions(imported);
    },

    resetDemo: () => {
      const d = demoData();
      setData(d);
      setSessions(demoSessions(d));
    },
    setAutoFix: (on: boolean) => setAutoFix(on),
    fixNow: () => {
      const res = autofix(data, sessions);
      setSessions(res.sessions);
      if (res.fixes.length) setLastFixes(res.fixes);
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
