import { DataSet, Session, SLOT_HOURS, rid } from './types';

interface Job { moduleId: string; groupId: string }
interface Attempt { sessions: Session[]; unplaced: number }

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Greedy constraint solver with randomized restarts.
 * Hard constraints: teacher availability, teacher/group/room double-booking,
 * room capacity, room type (lab vs classroom), teacher weekly hour cap.
 * Soft constraints: teacher preferred slots, spreading load across days,
 * best-fit room selection.
 */
export function generateSchedule(d: DataSet, runs = 60): Session[] {
  const { days, slots } = d.settings;
  if (!days.length || !slots.length) return [];

  const jobs: Job[] = [];
  for (const m of d.modules) {
    if (!m.teacherId || !m.groupIds.length) continue;
    const hours = Math.max(0, Math.floor(m.hoursPerWeek || 0));
    for (const g of m.groupIds) for (let i = 0; i < hours; i++) jobs.push({ moduleId: m.id, groupId: g });
  }
  if (!jobs.length) return [];

  let best: Session[] = [];
  let bestUnplaced = jobs.length;
  for (let r = 0; r < runs; r++) {
    const { sessions, unplaced } = attempt(d, jobs, days, slots);
    if (unplaced < bestUnplaced || (unplaced === bestUnplaced && sessions.length > best.length)) {
      best = sessions;
      bestUnplaced = unplaced;
      if (unplaced === 0) break;
    }
  }
  return best;
}

function attempt(d: DataSet, jobs: Job[], days: string[], slots: string[]): Attempt {
  const tMap = new Map(d.teachers.map((t) => [t.id, t]));
  const mMap = new Map(d.modules.map((m) => [m.id, m]));
  const gMap = new Map(d.groups.map((g) => [g.id, g]));

  const busyT = new Set<string>(); // `${teacherId}@${day}|${slot}`
  const busyG = new Set<string>();
  const busyR = new Set<string>();
  const weekT = new Map<string, number>(); // sessions this week per teacher
  const dayT = new Map<string, number>();  // `${teacherId}@${day}`
  const dayG = new Map<string, number>();  // `${groupId}@${day}`
  const availCache = new Map<string, Set<string> | null>(); // teacherId -> null means "all"

  const availSet = (teacherId: string): Set<string> | null => {
    if (availCache.has(teacherId)) return availCache.get(teacherId)!;
    const t = tMap.get(teacherId);
    const set = t && t.restricted && t.availability.length ? new Set(t.availability) : null;
    availCache.set(teacherId, set);
    return set;
  };

  // Scarcity order: teachers with the fewest available slots get placed first.
  const scarcity = (j: Job) => {
    const m = mMap.get(j.moduleId);
    const set = m ? availSet(m.teacherId) : null;
    return set ? set.size : days.length * slots.length;
  };
  const order = shuffled(jobs).sort((a, b) => scarcity(a) - scarcity(b));

  const sessions: Session[] = [];
  let unplaced = 0;

  for (const job of order) {
    const m = mMap.get(job.moduleId);
    const g = gMap.get(job.groupId);
    const t = m ? tMap.get(m.teacherId) : undefined;
    if (!m || !g || !t) { unplaced++; continue; }

    const avail = availSet(t.id);
    const maxSessions = t.maxHours > 0 ? Math.floor(t.maxHours / SLOT_HOURS) : Infinity;
    if ((weekT.get(t.id) || 0) >= maxSessions) { unplaced++; continue; }

    type Cand = { day: string; slot: string; roomId: string; score: number };
    const cands: Cand[] = [];

    for (const day of days) {
      const tDay = dayT.get(`${t.id}@${day}`) || 0;
      const gDay = dayG.get(`${g.id}@${day}`) || 0;
      for (const slot of slots) {
        const k = `${day}|${slot}`;
        if (avail && !avail.has(k)) continue;
        if (busyT.has(`${t.id}@${k}`) || busyG.has(`${g.id}@${k}`)) continue;

        // Candidate rooms: free, big enough, correct type.
        let chosen: { id: string; capacity: number } | null = null;
        for (const r of d.rooms) {
          if (busyR.has(`${r.id}@${k}`)) continue;
          if (r.capacity < g.size) continue;
          if (m.roomType === 'lab' && r.type !== 'lab') continue;
          if (!chosen || r.capacity < chosen.capacity) chosen = r; // best fit
        }
        if (!chosen) continue;

        const pref = t.prefSlots.includes(slot) ? 30 : 0;
        const score = pref - tDay * 6 - gDay * 4 - (chosen.capacity - g.size) / 10 + Math.random() * 2;
        cands.push({ day, slot, roomId: chosen.id, score });
      }
    }

    if (!cands.length) { unplaced++; continue; }
    cands.sort((a, b) => b.score - a.score);
    const c = cands[0];

    const s: Session = {
      id: rid('s'), day: c.day, slot: c.slot,
      teacherId: t.id, moduleId: m.id, groupId: g.id, roomId: c.roomId,
    };
    sessions.push(s);
    busyT.add(`${t.id}@${c.day}|${c.slot}`);
    busyG.add(`${g.id}@${c.day}|${c.slot}`);
    busyR.add(`${c.roomId}@${c.day}|${c.slot}`);
    weekT.set(t.id, (weekT.get(t.id) || 0) + 1);
    dayT.set(`${t.id}@${c.day}`, (dayT.get(`${t.id}@${c.day}`) || 0) + 1);
    dayG.set(`${g.id}@${c.day}`, (dayG.get(`${g.id}@${c.day}`) || 0) + 1);
  }

  return { sessions, unplaced };
}
