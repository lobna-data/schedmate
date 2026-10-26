import { Conflict, ConflictKind, DataSet, Session, slotKey } from './types';

const KIND_ORDER: ConflictKind[] = [
  'teacher_double', 'group_double', 'room_double',
  'room_capacity', 'room_type', 'teacher_unavailable', 'missing_hours',
];

export function detectConflicts(d: DataSet, sessions: Session[]): Conflict[] {
  const out: Conflict[] = [];
  const tMap = new Map(d.teachers.map((x) => [x.id, x]));
  const gMap = new Map(d.groups.map((x) => [x.id, x]));
  const rMap = new Map(d.rooms.map((x) => [x.id, x]));
  const mMap = new Map(d.modules.map((x) => [x.id, x]));

  const group = (keyFn: (s: Session) => string) => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const k = keyFn(s);
      const arr = map.get(k);
      if (arr) arr.push(s); else map.set(k, [s]);
    }
    return map;
  };

  const add = (kind: ConflictKind, ss: Session[], message: string) => {
    out.push({ id: `${kind}_${out.length}_${ss[0]?.id ?? 'x'}`, kind, message, sessionIds: ss.map((s) => s.id) });
  };

  const when = (s: Session) => `${s.day} ${s.slot}`;

  // 1) Teacher double-booked
  for (const [, ss] of group((s) => `${s.teacherId}@${s.day}|${s.slot}`)) {
    if (ss.length < 2) continue;
    const t = tMap.get(ss[0].teacherId);
    add('teacher_double', ss, `${t?.name ?? 'Teacher'} is double-booked on ${when(ss[0])} (${ss.map((s) => mMap.get(s.moduleId)?.name ?? 'class').join(', ')})`);
  }

  // 2) Group double-booked
  for (const [, ss] of group((s) => `${s.groupId}@${s.day}|${s.slot}`)) {
    if (ss.length < 2) continue;
    const g = gMap.get(ss[0].groupId);
    add('group_double', ss, `${g?.name ?? 'Group'} has two classes at the same time (${when(ss[0])})`);
  }

  // 3) Room double-booked
  for (const [, ss] of group((s) => `${s.roomId}@${s.day}|${s.slot}`)) {
    if (ss.length < 2 || !ss[0].roomId) continue;
    const r = rMap.get(ss[0].roomId);
    add('room_double', ss, `${r?.name ?? 'Room'} is double-booked on ${when(ss[0])}`);
  }

  for (const s of sessions) {
    const r = rMap.get(s.roomId);
    const g = gMap.get(s.groupId);
    const m = mMap.get(s.moduleId);
    const t = tMap.get(s.teacherId);

    // 4) Room capacity
    if (r && g && r.capacity < g.size) {
      add('room_capacity', [s], `${r.name} (${r.capacity} seats) is too small for ${g.name} (${g.size} students) on ${when(s)}`);
    }
    // 5) Room type (lab required)
    if (r && m && m.roomType === 'lab' && r.type !== 'lab') {
      add('room_type', [s], `${m.name} needs a lab room but ${r.name} is a classroom (${when(s)})`);
    }
    // 6) Teacher unavailable
    if (t && t.restricted && t.availability.length && !t.availability.includes(slotKey(s.day, s.slot))) {
      add('teacher_unavailable', [s], `${t.name} is not available on ${when(s)} (${m?.name ?? 'class'})`);
    }
    // Missing entities (e.g. module without teacher)
    if (m && !t) {
      add('teacher_unavailable', [s], `${m.name} has no teacher assigned`);
    }
  }

  // 7) Missing required hours (per module × group)
  for (const m of d.modules) {
    const required = Math.max(0, Math.floor(m.hoursPerWeek || 0));
    if (!required) continue;
    for (const gid of m.groupIds) {
      const done = sessions.filter((s) => s.moduleId === m.id && s.groupId === gid).length;
      if (done < required) {
        const g = gMap.get(gid);
        out.push({
          id: `missing_${m.id}_${gid}`,
          kind: 'missing_hours',
          message: `${m.name} – ${g?.name ?? gid}: ${required - done} of ${required} required weekly sessions not scheduled`,
          sessionIds: [],
        });
      }
    }
    if (!m.groupIds.length) {
      out.push({
        id: `missing_${m.id}_nogroup`,
        kind: 'missing_hours',
        message: `${m.name}: no student group assigned`,
        sessionIds: [],
      });
    }
  }

  out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return out;
}

export function conflictSessionIds(conflicts: Conflict[]): Set<string> {
  const ids = new Set<string>();
  for (const c of conflicts) for (const id of c.sessionIds) ids.add(id);
  return ids;
}

export const CONFLICT_LABEL: Record<ConflictKind, string> = {
  teacher_double: 'Teacher double-booked',
  room_double: 'Room double-booked',
  group_double: 'Group double-booked',
  room_capacity: 'Room capacity',
  room_type: 'Room type',
  teacher_unavailable: 'Teacher unavailable',
  missing_hours: 'Missing required hours',
};

export const CONFLICT_LABEL_FR: Record<ConflictKind, string> = {
  teacher_double: 'Enseignant double-booké',
  room_double: 'Salle double-bookée',
  group_double: 'Groupe double-booké',
  room_capacity: 'Capacité de la salle',
  room_type: 'Type de salle',
  teacher_unavailable: 'Enseignant indisponible',
  missing_hours: 'Heures manquantes',
};
