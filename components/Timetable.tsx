'use client';
import { useState } from 'react';
import { useStore } from '../lib/store';
import { CalendarOff } from 'lucide-react';

export default function Timetable({
  mode, conflictIds, lang,
}: { mode: 'student' | 'teacher'; conflictIds: Set<string>; lang: 'EN' | 'FR' }) {
  const s = useStore();
  const list = mode === 'student' ? s.data.groups : s.data.teachers;
  const [sel, setSel] = useState('');
  const id = sel && list.some((x) => x.id === sel) ? sel : list[0]?.id ?? '';
  const fr = lang === 'FR';

  if (!list.length) {
    return <p className="muted center"><CalendarOff size={16} /> {fr ? 'Ajoutez des données dans l\'onglet Data (ou importez un Excel).' : 'Add data in the Data tab (or upload an Excel file).'}</p>;
  }

  const tName = (tid: string) => s.data.teachers.find((x) => x.id === tid)?.name ?? '—';
  const mName = (mid: string) => s.data.modules.find((x) => x.id === mid)?.name ?? '—';
  const gName = (gid: string) => s.data.groups.find((x) => x.id === gid)?.name ?? '—';
  const rName = (rid: string) => s.data.rooms.find((x) => x.id === rid)?.name ?? '—';

  const mine = s.sessions.filter((x) => (mode === 'student' ? x.groupId === id : x.teacherId === id));
  const { days, slots } = s.data.settings;
  const selName = list.find((x) => x.id === id)?.name ?? '';

  return (
    <div>
      <div className="viewbar sub">
        <div className="tabs">
          <span className="sel-label">{mode === 'student' ? (fr ? 'Groupe' : 'Group') : (fr ? 'Enseignant' : 'Teacher')}:</span>
          <select className="sel" value={id} onChange={(e) => setSel(e.target.value)}>
            {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <span className="muted small">{mine.length} {fr ? 'séances' : 'sessions'} • {selName}</span>
      </div>

      <div className="tablewrap ttwrap">
        <table className="tt">
          <thead>
            <tr>
              <th>{fr ? 'Horaire' : 'Time'}</th>
              {days.map((d) => <th key={d}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot}>
                <td className="tt-slot">{slot}</td>
                {days.map((d) => {
                  const cell = mine.filter((x) => x.day === d && x.slot === slot);
                  return (
                    <td key={d}>
                      {cell.map((x) => (
                        <div key={x.id} className={conflictIds.has(x.id) ? 'tt-card bad' : 'tt-card'}>
                          <b>{mName(x.moduleId)}</b>
                          <span>{mode === 'student' ? tName(x.teacherId) : gName(x.groupId)}</span>
                          <em>{rName(x.roomId)}</em>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!mine.length && <p className="muted center">{fr ? 'Aucune séance pour cette sélection.' : 'No sessions for this selection.'}</p>}
    </div>
  );
}
