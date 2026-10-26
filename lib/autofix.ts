import { Conflict, ConflictKind, DataSet, Session, rid, slotKey } from './types';
import { detectConflicts } from './conflicts';

/** Reason strings for the fix log */
const REASON: Record<ConflictKind, string> = {
  teacher_double: 'teacher double-booked',
  group_double: 'group double-booked',
  room_double: 'room double-booked',
  room_capacity: 'room too small',
  room_type: 'lab class in a non-lab room',
  teacher_unavailable: 'teacher unavailable',
  missing_hours: 'missing hours',
};

/** Score weighting for best-candidate selection (mirrors Python exactly) */
const SCORE_WEIGHTS = {
  preferred: 2,
  dayPenalty: 6,
  groupPenalty: 4,
  capacityBonus: 10,
};

/** Result returned by the auto-fix engine */
export interface FixResult {
  sessions: Session[];
  fixes: string[];
  remaining: Conflict[];
}

/** Check whether a slot is OK for a given teacher/group/room/assignment */
class Env {
  data: DataSet;
  sessions: Session[];
  fixes: string[];
  tMap: Map<string, Teacher>;
  mMap: Map<string, Module>;
  gMap: Map<string, Group>;
  rMap: Map<string, Room>;

  constructor(data: DataSet, sessions: Session[], fixes: string[]) {
    this.data = data;
    this.sessions = sessions;
    this.fixes = fixes;
    this.tMap = new Map(data.teachers.map((t) => [t.id, t]));
    this.mMap = new Map(data.modules.map((m) => [m.id, m]));
    this.gMap = new Map(data.groups.map((g) => [g.id, g]));
    this.rMap = new Map(data.rooms.map((r) => [r.id, r]));
  }

  /** True if the slot can accept this session (no clash, capacity, type, avail). */
  slotOk(
    day: string,
    slot: string,
    teacherId: string,
    groupId: string,
    moduleId: string,
    roomId: string,
    excludeId?: string
  ): boolean {
    // Teacher availability check (when restricted)
    const teacher = this.tMap.get(teacherId);
    if (teacher && teacher.restricted) {
      const key = `${day}|${slot}`;
      if (!teacher.availability.includes(key)) return false;
    }

    // Teacher weekly hour cap
    const teacherSessions = this.sessions.filter(
      (s) => s.teacherId === teacherId && s.id !== excludeId
    );
    const hoursThisWeek = teacherSessions.reduce((sum, s) => sum + SLOT_HOURS, 0);
    if (teacher.maxHours > 0 && hoursThisWeek + SLOT_HOURS > teacher.maxHours) return false;

    // Room capacity check
    const room = this.rMap.get(roomId);
    if (room && room.capacity < groupSize(groupId)) return false;

    // Room type check (lab vs classroom)
    const module = this.mMap.get(moduleId);
    if (module && module.roomType === 'lab' && room?.type !== 'lab') return false;
    if (module && module.roomType === 'classroom' && room?.type === 'lab') return false;

    // Group double-booking check
    const groupOccupied = this.sessions.filter(
      (s) => s.groupId === groupId && s.day === day && s.slot === slot && s.id !== excludeId
    ).length > 0;
    if (groupOccupied) return false;

    // Teacher double-booking check
    const teacherOccupied = this.sessions.filter(
      (s) => s.teacherId === teacherId && s.day === day && s.slot === slot && s.id !== excludeId
    ).length > 0;
    if (teacherOccupied) return false;

    return true;
  }

  /** Score a candidate day+slot+room; higher is better. First-wins on ties. */
  scoreCandidate(day: string, slot: string, roomId: string, moduleId: string, teacherId: string, groupId: string): number {
    const module = this.mMap.get(moduleId);
    const teacher = this.tMap.get(teacherId);
    const group = this.gMap.get(groupId);
    const room = this.rMap.get(roomId);
    if (!module || !teacher || !group || !room) return -Infinity;

    let score = 0;

    // Preferred slots bonus
    if (module.prefSlots && module.prefSlots.length > 0) {
      const key = `${day}|${slot}`;
      if (module.prefSlots.includes(key)) score += SCORE_WEIGHTS.preferred;
    }

    // Day & group penalties (penalize early days/first slots slightly)
    const dayIdx = this.data.settings.days.indexOf(day);
    const slotIdx = this.data.settings.slots.indexOf(slot);
    if (dayIdx >= 0) score -= SCORE_WEIGHTS.dayPenalty * dayIdx;
    if (slotIdx >= 0) score -= 1; // small penalty for later slots

    // Capacity bonus: bigger cushion = better
    if (room && group) {
      const cushion = room.capacity - group.size;
      score += Math.max(0, Math.floor(cushion / 10)) * SCORE_WEIGHTS.capacityBonus;
    }

    return score;
  }

  /** Find the best day+slot+room for a module's session, excluding a given session id. */
  bestCandidate(
    moduleId: string,
    groupId: string,
    teacherId: string,
    excludeId?: string
  ): { day: string; slot: string; roomId: string } | null {
    const module = this.mMap.get(moduleId);
    if (!module) return null;

    const days = this.data.settings.days;
    const slots = this.data.settings.slots;
    const rooms = Array.from(this.rMap.keys());

    let best: { day: string; slot: string; roomId: string; score: number } | null = null;

    for (const day of days) {
      for (const slot of slots) {
        for (const roomId of rooms) {
          if (!this.slotOk(day, slot, teacherId, groupId, moduleId, roomId, excludeId)) continue;
          const s = this.scoreCandidate(day, slot, roomId, moduleId, teacherId, groupId);
          if (best === null || s.score > best!.score) {
            best = { day, slot, roomId, score: s.score };
          }
        }
      }
    }

    return best ? { day: best.day, slot: best.slot, roomId: best.roomId } : null;
  }
}

/** Move a session to a new day+slot+room, recording fixes. Returns list of fix descriptions. */
function _move(
  sessions: Session[],
  sessionId: string,
  newDay: string,
  newSlot: string,
  newRoomId: string,
  data: DataSet,
  fixes: string[]
): Session[] {
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return sessions;

  const old = { ...sessions[idx] };
  sessions[idx] = { ...sessions[idx], day: newDay, slot: newSlot, roomId: newRoomId };

  // Record the move
  const module = data.modules.find((m) => m.id === sessions[idx].moduleId);
  const teacher = data.teachers.find((t) => t.id === sessions[idx].teacherId);
  const group = data.groups.find((g) => g.id === sessions[idx].groupId);
  const roomName = newRoomId ? data.rooms.find((r) => r.id === newRoomId)?.name ?? '' : '';
  const teacherName = teacher?.name ?? '';
  const groupName = group?.name ?? '';

  fixes.push(
    `Moved ${groupName ?? ''}${teacherName ?? ''}'s class "${module?.name ?? ''}" from ${old.day} ${old.slot} to ${newDay} ${newSlot} (${REASON[sessionId.includes('missing') ? 'missing_hours' : 'unknown']})`
  );

  return sessions;
}

/** Reassign a session to a different room, recording fixes. */
function _reassignRoom(
  sessions: Session[],
  sessionId: string,
  newRoomId: string,
  data: DataSet,
  fixes: string[]
): Session[] {
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return sessions;

  const oldRoom = sessions[idx].roomId;
  sessions[idx] = { ...sessions[idx], roomId: newRoomId };

  const module = data.modules.find((m) => m.id === sessions[idx].moduleId);
  const teacher = data.teachers.find((t) => t.id === sessions[idx].teacherId);
  const group = data.groups.find((g) => g.id === sessions[idx].groupId);
  const roomName = data.rooms.find((r) => r.id === newRoomId)?.name ?? '';
  const teacherName = teacher?.name ?? '';
  const groupName = group?.name ?? '';

  fixes.push(
    `Reassigned "${module?.name ?? ''}" (${groupName ?? ''} / ${teacherName ?? ''}) from ${oldRoom} to ${roomName} (capacity ${data.rooms.find((r) => r.id === newRoomId)?.capacity ?? 0})`
  );

  return sessions;
}

/** Fill missing hours by reassigning unplaced sessions to available slots. */
function _fillMissing(
  sessions: Session[],
  data: DataSet,
  fixes: string[]
): { sessions: Session[]; placed: boolean } {
  // Collect modules still needing hours
  const jobs: { moduleId: string; groupId: string }[] = [];
  for (const m of data.modules) {
    if (!m.teacherId || !m.groupIds.length) continue;
    const hours = Math.max(0, Math.floor(m.hoursPerWeek || 0));
    for (const g of m.groupIds) for (let i = 0; i < hours; i++) {
      jobs.push({ moduleId: m.id, groupId: g });
    }
  }

  // Already-placed sessions per module+group
  const placed = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = `${s.moduleId}|${s.groupId}`;
    if (!placed.has(key)) placed.set(key, []);
    placed.get(key)!.push(s);
  }

  // Try to place each remaining job
  const remaining: { moduleId: string; groupId: string }[] = [];
  for (const job of jobs) {
    const existing = placed.get(`${job.moduleId}|${job.groupId}`) || [];
    const cand = new Env(data, sessions, fixes).bestCandidate(
      job.moduleId,
      job.groupId,
      data.teachers.find((t) => t.id === data.modules.find((m) => m.id === job.moduleId)?.teacherId)?.id ?? '',
      undefined
    );
    if (cand) {
      sessions = _move(sessions, '', cand.day, cand.slot, cand.roomId, data, fixes);
      placed.set(`${job.moduleId}|${job.groupId}`, (placed.get(`${job.moduleId}|${job.groupId}`) || []).concat([]));
    } else {
      remaining.push(job);
    }
  }

  return { sessions, placed: remaining.length === 0 };
}

/** Main auto-fix loop: detect conflicts, repair, repeat. Runs at most maxPasses times. */
export function autofix(
  data: DataSet,
  sessions: Session[],
  maxPasses = 50
): { sessions: Session[]; fixes: string[]; remaining: Conflict[] } {
  let currentSessions = sessions.slice();
  const allFixes: string[] = [];
  let remaining: Conflict[] = detectConflicts(data, currentSessions);

  for (let pass = 0; pass < maxPasses && remaining.length > 0; pass++) {
    const fixesThisPass: string[] = [];

    // Repair each conflict
    for (const conflict of remaining) {
      const { sessionIds } = conflict;
      // Pick the first session to move; others stay (or we reassign rooms)
      const sessionId = sessionIds[0];
      const session = currentSessions.find((s) => s.id === sessionId);
      if (!session) continue;

      const module = data.modules.find((m) => m.id === session.moduleId);
      const teacher = data.teachers.find((t) => t.id === session.teacherId);
      const group = data.groups.find((g) => g.id === session.groupId);

      // Strategy depends on conflict kind
      switch (conflict.kind) {
        case 'teacher_double': {
          // Move this session to a new slot for the same teacher
          const cand = new Env(data, currentSessions, fixesThisPass).bestCandidate(
            module?.id ?? '',
            group?.id ?? '',
            teacher?.id ?? '',
            sessionId
          );
          if (cand) {
            currentSessions = _move(currentSessions, sessionId, cand.day, cand.slot, cand.roomId, data, fixesThisPass);
          }
          break;
        }
        case 'group_double': {
          // Move this session to a different group's slot (or reassign room)
          const cand = new Env(data, currentSessions, fixesThisPass).bestCandidate(
            module?.id ?? '',
            group?.id ?? '',
            teacher?.id ?? '',
            sessionId
          );
          if (cand) {
            currentSessions = _move(currentSessions, sessionId, cand.day, cand.slot, cand.roomId, data, fixesThisPass);
          }
          break;
        }
        case 'room_double': {
          // Reassign to a different room of same type, same capacity+
          const cand = new Env(data, currentSessions, fixesThisPass).bestCandidate(
            module?.id ?? '',
            group?.id ?? '',
            teacher?.id ?? '',
            sessionId
          );
          if (cand) {
            currentSessions = _reassignRoom(currentSessions, sessionId, cand.roomId, data, fixesThisPass);
          }
          break;
        }
        case 'room_capacity': {
          // Move to a larger room
          const largerRooms = Array.from(data.rooms.entries())
            .filter(([, r]) => r.capacity > (data.rooms.find((r2) => r2.id === session.roomId)?.capacity ?? 0))
            .map(([, r]) => r.id);
          if (largerRooms.length > 0) {
            currentSessions = _reassignRoom(currentSessions, sessionId, largerRooms[0], data, fixesThisPass);
          }
          break;
        }
        case 'room_type': {
          // Move to a room of the correct type
          const correctType = module?.roomType ?? 'classroom';
          const correctRooms = Array.from(data.rooms.entries())
            .filter(([, r]) => r.type === correctType && r.id !== session.roomId)
            .map(([, r]) => r.id);
          if (correctRooms.length > 0) {
            currentSessions = _reassignRoom(currentSessions, sessionId, correctRooms[0], data, fixesThisPass);
          }
          break;
        }
        case 'teacher_unavailable': {
          // Move to a slot the teacher IS available for
          const cand = new Env(data, currentSessions, fixesThisPass).bestCandidate(
            module?.id ?? '',
            group?.id ?? '',
            teacher?.id ?? '',
            sessionId
          );
          if (cand) {
            currentSessions = _move(currentSessions, sessionId, cand.day, cand.slot, cand.roomId, data, fixesThisPass);
          }
          break;
        }
        case 'missing_hours': {
          // Fill missing hours via _fillMissing
          const fillResult = _fillMissing(currentSessions, data, fixesThisPass);
          currentSessions = fillResult.sessions;
          if (!fillResult.placed) break; // can't place more
          break;
        }
        default:
          // If we can't determine a fix, just reassign room
          const cand = new Env(data, currentSessions, fixesThisPass).bestCandidate(
            module?.id ?? '',
            group?.id ?? '',
            teacher?.id ?? '',
            sessionId
          );
          if (cand) {
            currentSessions = _reassignRoom(currentSessions, sessionId, cand.roomId, data, fixesThisPass);
          }
          break;
      }
    }

    allFixes.push(...fixesThisPass);

    // Re-detect conflicts
    remaining = detectConflicts(data, currentSessions);
  }

  return {
    sessions: currentSessions,
    fixes: allFixes,
    remaining,
  };
}

/** Convenience: returns true when the schedule is conflict-free. */
export const isClean = (r: FixResult) => r.remaining.length === 0;