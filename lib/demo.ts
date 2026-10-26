import { DataSet, Session, DEFAULT_SLOTS, slotKey } from './types';
import { generateSchedule } from './scheduler';

export function demoData(): DataSet {
  // Algerian university week: Saturday through Thursday (Friday is the weekend).
  const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
  const t = (id: string, name: string, maxHours: number, notes = '') => ({
    id, name, maxHours, restricted: false, availability: [] as string[], prefSlots: [] as string[], notes,
  });
  const data: DataSet = {
    settings: { days, slots: DEFAULT_SLOTS },
    teachers: [
      t('t1', 'Dr. Ahmed Benali', 18, 'Prefers lab sessions in the morning'),
      t('t2', 'Dr. Sara Mansouri', 18),
      t('t3', 'Dr. Karim Haddad', 20),
      t('t4', 'Dr. Nadia Kaci', 16, 'Available mornings only on Thursday'),
    ],
    groups: [
      { id: 'g1', name: 'L1-G1', size: 32 },
      { id: 'g2', name: 'L1-G2', size: 30 },
      { id: 'g3', name: 'L2-G1', size: 28 },
      { id: 'g4', name: 'L2-G2', size: 26 },
    ],
    rooms: [
      { id: 'r1', name: 'Room 6', capacity: 40, type: 'classroom' },
      { id: 'r2', name: 'Room 8', capacity: 40, type: 'classroom' },
      { id: 'r3', name: 'Room 12', capacity: 35, type: 'classroom' },
      { id: 'r4', name: 'Lab 2', capacity: 32, type: 'lab' },
      { id: 'r5', name: 'Lab 3', capacity: 24, type: 'lab' },
    ],
    modules: [
      { id: 'm1', name: 'Database Systems', teacherId: 't1', hoursPerWeek: 2, groupIds: ['g3', 'g4'], roomType: 'lab' },
      { id: 'm2', name: 'Networks', teacherId: 't2', hoursPerWeek: 2, groupIds: ['g3', 'g4'], roomType: 'classroom' },
      { id: 'm3', name: 'Algorithms', teacherId: 't3', hoursPerWeek: 2, groupIds: ['g1', 'g2'], roomType: 'classroom' },
      { id: 'm4', name: 'English', teacherId: 't4', hoursPerWeek: 2, groupIds: ['g1', 'g2'], roomType: 'classroom' },
      { id: 'm5', name: 'Software Engineering', teacherId: 't3', hoursPerWeek: 1, groupIds: ['g3'], roomType: 'classroom' },
      { id: 'm6', name: 'Intro to AI', teacherId: 't1', hoursPerWeek: 1, groupIds: ['g1'], roomType: 'lab' },
    ],
  };
  return data;
}

export function demoSessions(data: DataSet): Session[] {
  // Dr. Nadia is available every time EXCEPT Thursday afternoons (14:00, 15:45, 17:30),
  // for a realistic demo that still generates a conflict-free timetable.
  const nadia = data.teachers.find((x) => x.id === 't4');
  if (nadia) {
    nadia.restricted = true;
    nadia.availability = data.settings.days
      .flatMap((d) => data.settings.slots.map((s) => slotKey(d, s)))
      .filter((k) => !k.startsWith('Thursday|14:') && !k.startsWith('Thursday|15:') && !k.startsWith('Thursday|17:'));
  }
  return generateSchedule(data);
}
