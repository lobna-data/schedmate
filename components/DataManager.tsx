'use client';
import { useState } from 'react';
import { useStore } from '../lib/store';
import { ALL_DAYS, Teacher, Module, Group, Room, rid } from '../lib/types';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';

type Tab = 'teachers' | 'modules' | 'groups' | 'rooms' | 'settings';
type Lang = 'EN' | 'FR';

const L = {
  EN: {
    tabs: { teachers: 'Teachers', modules: 'Modules / courses', groups: 'Student groups', rooms: 'Rooms', settings: 'Days & slots' } as Record<Tab, string>,
    add: 'Add', save: 'Save', cancel: 'Cancel', edit: 'Edit', del: 'Delete', name: 'Name',
    maxHours: 'Max hours / week', notes: 'Notes (preferences)', avail: 'Limit availability',
    availHint: 'Unchecked slots are UNAVAILABLE for this teacher.',
    pref: 'Preferred slots (soft)', all: 'Select all', teacher: 'Teacher', hours: 'Sessions / week (required hours)',
    groups: 'Groups', roomType: 'Room type', size: 'Students', capacity: 'Capacity',
    type: 'Type', day: 'Day', slot: 'Slot', addSlot: 'Add slot', empty: 'Nothing here yet — add your first entry above.',
    none: '—', classroom: 'Classroom', lab: 'Lab', allDays: 'Teaching days', warn: 'Saving changes schedules the timetable automatically — conflicts are repaired instantly.',
  },
  FR: {
    tabs: { teachers: 'Enseignants', modules: 'Modules / cours', groups: 'Groupes', rooms: 'Salles', settings: 'Jours & créneaux' } as Record<Tab, string>,
    add: 'Ajouter', save: 'Enregistrer', cancel: 'Annuler', edit: 'Modifier', del: 'Supprimer', name: 'Nom',
    maxHours: 'Heures max / semaine', notes: 'Notes (préférences)', avail: 'Limiter la disponibilité',
    availHint: 'Les créneaux non cochés sont INDISPONIBLES pour cet enseignant.',
    pref: 'Créneaux préférés (soft)', all: 'Tout cocher', teacher: 'Enseignant', hours: 'Séances / semaine (heures requises)',
    groups: 'Groupes', roomType: 'Type de salle', size: 'Étudiants', capacity: 'Capacité',
    type: 'Type', day: 'Jour', slot: 'Créneau', addSlot: 'Ajouter', empty: 'Rien ici — ajoutez une entrée ci-dessus.',
    none: '—', classroom: 'Salle', lab: 'Labo', allDays: 'Jours de cours', warn: 'Les changements ne régénèrent pas automatiquement — cliquez sur Générer.',
  },
};

export default function DataManager({ lang }: { lang: Lang }) {
  const t = L[lang];
  const [tab, setTab] = useState<Tab>('teachers');

  return (
    <div className="panel">
      <div className="tabs2">
        {(Object.keys(t.tabs) as Tab[]).map((k) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{t.tabs[k]}</button>
        ))}
      </div>
      <p className="muted small">{t.warn}</p>
      {tab === 'teachers' && <Teachers t={t} />}
      {tab === 'modules' && <Modules t={t} />}
      {tab === 'groups' && <Groups t={t} />}
      {tab === 'rooms' && <Rooms t={t} />}
      {tab === 'settings' && <SettingsPanel t={t} />}
    </div>
  );
}

type Dict = (typeof L)['EN'];

function Actions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="row-actions">
      <button className="ico" title="Edit" onClick={onEdit}><Pencil size={14} /></button>
      <button className="ico danger" title="Delete" onClick={onDelete}><Trash2 size={14} /></button>
    </span>
  );
}

/* ---------------- Teachers ---------------- */
function Teachers({ t }: { t: Dict }) {
  const s = useStore();
  const [f, setF] = useState<Partial<Teacher>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [openMatrix, setOpenMatrix] = useState<string | null>(null);

  const start = (x?: Teacher) => {
    setEditing(x?.id ?? null);
    setF(x ? { ...x } : { id: rid('t'), name: '', maxHours: 18, restricted: false, availability: [], prefSlots: [], notes: '' });
  };
  const allKeys = () => s.data.settings.days.flatMap((d) => s.data.settings.slots.map((x) => `${d}|${x}`));
  const submit = () => {
    if (!f.name?.trim()) return;
    const item: Teacher = {
      id: f.id ?? rid('t'), name: f.name.trim(), maxHours: Number(f.maxHours) || 0,
      restricted: !!f.restricted, availability: f.availability ?? [], prefSlots: f.prefSlots ?? [], notes: f.notes ?? '',
    };
    s.saveTeacher(item);
    setF({}); setEditing(null);
  };
  const toggleKey = (k: string) => {
    const cur = new Set(f.availability ?? []);
    cur.has(k) ? cur.delete(k) : cur.add(k);
    setF({ ...f, availability: [...cur] });
  };
  const togglePref = (slot: string) => {
    const cur = new Set(f.prefSlots ?? []);
    cur.has(slot) ? cur.delete(slot) : cur.add(slot);
    setF({ ...f, prefSlots: [...cur] });
  };

  return (
    <div>
      <div className="form">
        <label className="field"><span>{t.name}</span>
          <input value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dr. Ahmed Benali" />
        </label>
        <label className="field"><span>{t.maxHours}</span>
          <input type="number" min={0} value={f.maxHours ?? 18} onChange={(e) => setF({ ...f, maxHours: Number(e.target.value) })} />
        </label>
        <label className="field"><span>{t.notes}</span>
          <input value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={t.none} />
        </label>
        <div className="field check">
          <label><input type="checkbox" checked={!!f.restricted} onChange={(e) => setF({ ...f, restricted: e.target.checked, availability: e.target.checked && !(f.availability ?? []).length ? allKeys() : f.availability ?? [] })} /> {t.avail}</label>
        </div>
        <div className="field btns">
          <button className="btn primary" onClick={submit}><Plus size={14} />{editing ? t.save : t.add}</button>
          {editing && <button className="btn" onClick={() => { setF({}); setEditing(null); }}>{t.cancel}</button>}
        </div>
      </div>

      {f.restricted && (
        <div className="subbox">
          <div className="subtop"><b>{t.avail}</b><button className="btn tiny" onClick={() => setF({ ...f, availability: allKeys() })}>{t.all}</button></div>
          <p className="muted small">{t.availHint}</p>
          <div className="matrix">
            <div className="mrow head"><span></span>{s.data.settings.slots.map((x) => <span key={x}>{x}</span>)}</div>
            {s.data.settings.days.map((d) => (
              <div className="mrow" key={d}>
                <span className="day">{d}</span>
                {s.data.settings.slots.map((x) => {
                  const k = `${d}|${x}`;
                  const on = (f.availability ?? []).includes(k);
                  return <button key={x} className={on ? 'cell on' : 'cell'} onClick={() => toggleKey(k)}>{on ? <Check size={12} /> : ''}</button>;
                })}
              </div>
            ))}
          </div>
          <div className="subtop"><b>{t.pref}</b></div>
          <div className="chips">
            {s.data.settings.slots.map((x) => (
              <button key={x} className={(f.prefSlots ?? []).includes(x) ? 'chip on' : 'chip'} onClick={() => togglePref(x)}>{x}</button>
            ))}
          </div>
        </div>
      )}

      <table className="tbl">
        <thead><tr><th>{t.name}</th><th>{t.maxHours}</th><th>{t.avail}</th><th>{t.pref}</th><th></th></tr></thead>
        <tbody>
          {s.data.teachers.map((x) => (
            <tr key={x.id}>
              <td><b>{x.name}</b>{x.notes && <div className="muted small">{x.notes}</div>}</td>
              <td>{x.maxHours || '∞'}</td>
              <td>
                <button className="chip" onClick={() => setOpenMatrix(openMatrix === x.id ? null : x.id)}>
                  {!x.restricted ? 'All slots' : `${x.availability.length} slots`}
                </button>
              </td>
              <td>{x.prefSlots.length ? x.prefSlots.join(', ') : t.none}</td>
              <td><Actions onEdit={() => start(x)} onDelete={() => s.removeTeacher(x.id)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!s.data.teachers.length && <p className="muted">{t.empty}</p>}

      {openMatrix && (() => {
        const x = s.data.teachers.find((z) => z.id === openMatrix);
        if (!x) return null;
        return (
          <div className="subbox">
            <div className="subtop"><b>{x.name} — {t.avail}</b>
              <button className="btn tiny" onClick={() => setOpenMatrix(null)}>{t.cancel}</button>
            </div>
            <div className="matrix">
              <div className="mrow head"><span></span>{s.data.settings.slots.map((sl) => <span key={sl}>{sl}</span>)}</div>
              {s.data.settings.days.map((d) => (
                <div className="mrow" key={d}>
                  <span className="day">{d}</span>
                  {s.data.settings.slots.map((sl) => {
                    const on = !x.restricted || x.availability.includes(`${d}|${sl}`);
                    return <span key={sl} className={on ? 'cell on static' : 'cell static'}>{on ? <Check size={12} /> : ''}</span>;
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------------- Modules ---------------- */
function Modules({ t }: { t: Dict }) {
  const s = useStore();
  const [f, setF] = useState<Partial<Module>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const start = (x?: Module) => {
    setEditing(x?.id ?? null);
    setF(x ? { ...x, groupIds: [...x.groupIds] } : { id: rid('m'), name: '', teacherId: s.data.teachers[0]?.id ?? '', hoursPerWeek: 2, groupIds: [], roomType: 'classroom' });
  };
  const submit = () => {
    if (!f.name?.trim() || !f.teacherId) return;
    s.saveModule({
      id: f.id ?? rid('m'), name: f.name.trim(), teacherId: f.teacherId,
      hoursPerWeek: Math.max(1, Number(f.hoursPerWeek) || 1),
      groupIds: f.groupIds ?? [], roomType: f.roomType ?? 'classroom',
    });
    setF({}); setEditing(null);
  };
  const toggleGroup = (id: string) => {
    const cur = new Set(f.groupIds ?? []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    setF({ ...f, groupIds: [...cur] });
  };
  const name = (id: string) => s.data.teachers.find((x) => x.id === id)?.name ?? t.none;

  return (
    <div>
      <div className="form">
        <label className="field"><span>{t.name}</span>
          <input value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Database Systems" />
        </label>
        <label className="field"><span>{t.teacher}</span>
          <select value={f.teacherId ?? ''} onChange={(e) => setF({ ...f, teacherId: e.target.value })}>
            <option value="">{t.none}</option>
            {s.data.teachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="field"><span>{t.hours}</span>
          <input type="number" min={1} value={f.hoursPerWeek ?? 2} onChange={(e) => setF({ ...f, hoursPerWeek: Number(e.target.value) })} />
        </label>
        <label className="field"><span>{t.roomType}</span>
          <select value={f.roomType ?? 'classroom'} onChange={(e) => setF({ ...f, roomType: e.target.value as Module['roomType'] })}>
            <option value="classroom">{t.classroom}</option>
            <option value="lab">{t.lab}</option>
          </select>
        </label>
        <div className="field wide"><span>{t.groups}</span>
          <div className="chips">
            {s.data.groups.map((g) => (
              <button key={g.id} className={(f.groupIds ?? []).includes(g.id) ? 'chip on' : 'chip'} onClick={() => toggleGroup(g.id)}>{g.name}</button>
            ))}
            {!s.data.groups.length && <span className="muted small">{t.none}</span>}
          </div>
        </div>
        <div className="field btns">
          <button className="btn primary" onClick={submit}><Plus size={14} />{editing ? t.save : t.add}</button>
          {editing && <button className="btn" onClick={() => { setF({}); setEditing(null); }}>{t.cancel}</button>}
        </div>
      </div>

      <table className="tbl">
        <thead><tr><th>{t.name}</th><th>{t.teacher}</th><th>{t.hours}</th><th>{t.groups}</th><th>{t.roomType}</th><th></th></tr></thead>
        <tbody>
          {s.data.modules.map((m) => (
            <tr key={m.id}>
              <td><b>{m.name}</b></td>
              <td>{name(m.teacherId)}</td>
              <td>{m.hoursPerWeek}</td>
              <td>{m.groupIds.map((g) => <span className="tag" key={g}>{s.data.groups.find((x) => x.id === g)?.name ?? '?'}</span>)}</td>
              <td>{m.roomType === 'lab' ? t.lab : t.classroom}</td>
              <td><Actions onEdit={() => start(m)} onDelete={() => s.removeModule(m.id)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!s.data.modules.length && <p className="muted">{t.empty}</p>}
    </div>
  );
}

/* ---------------- Groups ---------------- */
function Groups({ t }: { t: Dict }) {
  const s = useStore();
  const [f, setF] = useState<{ id?: string; name: string; size: number }>({ name: '', size: 30 });
  const [editing, setEditing] = useState<string | null>(null);

  const submit = () => {
    if (!f.name.trim()) return;
    s.saveGroup({ id: f.id ?? rid('g'), name: f.name.trim(), size: Math.max(1, Number(f.size) || 1) });
    setF({ name: '', size: 30 }); setEditing(null);
  };

  return (
    <div>
      <div className="form">
        <label className="field"><span>{t.name}</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="L2-G1" />
        </label>
        <label className="field"><span>{t.size}</span>
          <input type="number" min={1} value={f.size} onChange={(e) => setF({ ...f, size: Number(e.target.value) })} />
        </label>
        <div className="field btns">
          <button className="btn primary" onClick={submit}><Plus size={14} />{editing ? t.save : t.add}</button>
          {editing && <button className="btn" onClick={() => { setF({ name: '', size: 30 }); setEditing(null); }}>{t.cancel}</button>}
        </div>
      </div>
      <table className="tbl">
        <thead><tr><th>{t.name}</th><th>{t.size}</th><th></th></tr></thead>
        <tbody>
          {s.data.groups.map((g) => (
            <tr key={g.id}>
              <td><b>{g.name}</b></td>
              <td>{g.size}</td>
              <td>
                <Actions
                  onEdit={() => { setF({ id: g.id, name: g.name, size: g.size }); setEditing(g.id); }}
                  onDelete={() => s.removeGroup(g.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!s.data.groups.length && <p className="muted">{t.empty}</p>}
    </div>
  );
}

/* ---------------- Rooms ---------------- */
function Rooms({ t }: { t: Dict }) {
  const s = useStore();
  const [f, setF] = useState<{ id?: string; name: string; capacity: number; type: Room['type'] }>({ name: '', capacity: 40, type: 'classroom' });
  const [editing, setEditing] = useState<string | null>(null);

  const submit = () => {
    if (!f.name.trim()) return;
    s.saveRoom({ id: f.id ?? rid('r'), name: f.name.trim(), capacity: Math.max(1, Number(f.capacity) || 1), type: f.type });
    setF({ name: '', capacity: 40, type: 'classroom' }); setEditing(null);
  };

  return (
    <div>
      <div className="form">
        <label className="field"><span>{t.name}</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Lab 2" />
        </label>
        <label className="field"><span>{t.capacity}</span>
          <input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} />
        </label>
        <label className="field"><span>{t.type}</span>
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Room['type'] })}>
            <option value="classroom">{t.classroom}</option>
            <option value="lab">{t.lab}</option>
          </select>
        </label>
        <div className="field btns">
          <button className="btn primary" onClick={submit}><Plus size={14} />{editing ? t.save : t.add}</button>
          {editing && <button className="btn" onClick={() => { setF({ name: '', capacity: 40, type: 'classroom' }); setEditing(null); }}>{t.cancel}</button>}
        </div>
      </div>
      <table className="tbl">
        <thead><tr><th>{t.name}</th><th>{t.capacity}</th><th>{t.type}</th><th></th></tr></thead>
        <tbody>
          {s.data.rooms.map((r) => (
            <tr key={r.id}>
              <td><b>{r.name}</b></td>
              <td>{r.capacity}</td>
              <td>{r.type === 'lab' ? t.lab : t.classroom}</td>
              <td>
                <Actions
                  onEdit={() => { setF({ id: r.id, name: r.name, capacity: r.capacity, type: r.type }); setEditing(r.id); }}
                  onDelete={() => s.removeRoom(r.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!s.data.rooms.length && <p className="muted">{t.empty}</p>}
    </div>
  );
}

/* ---------------- Days & slots ---------------- */
function SettingsPanel({ t }: { t: Dict }) {
  const s = useStore();
  const st = s.data.settings;
  const [slot, setSlot] = useState('');

  const toggleDay = (d: string) => {
    const days = st.days.includes(d) ? st.days.filter((x) => x !== d) : [...st.days, d];
    s.saveSettings({ ...st, days });
  };
  const addSlot = () => {
    const v = slot.trim();
    if (!v || st.slots.includes(v)) return;
    s.saveSettings({ ...st, slots: [...st.slots, v] });
    setSlot('');
  };
  const removeSlot = (x: string) => s.saveSettings({ ...st, slots: st.slots.filter((y) => y !== x) });

  return (
    <div>
      <div className="subbox">
        <div className="subtop"><b>{t.allDays}</b></div>
        <div className="chips">
          {ALL_DAYS.map((d) => (
            <button key={d} className={st.days.includes(d) ? 'chip on' : 'chip'} onClick={() => toggleDay(d)}>{d}</button>
          ))}
        </div>
      </div>
      <div className="subbox">
        <div className="subtop"><b>{t.slot}</b></div>
        <div className="chips">
          {st.slots.map((x) => (
            <span className="chip on" key={x}>{x}
              <button className="x" onClick={() => removeSlot(x)} title={t.del}>×</button>
            </span>
          ))}
        </div>
        <div className="form" style={{ marginTop: 10 }}>
          <label className="field"><span>{t.addSlot}</span>
            <input value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="16:30–18:00" onKeyDown={(e) => e.key === 'Enter' && addSlot()} />
          </label>
          <div className="field btns"><button className="btn primary" onClick={addSlot}><Plus size={14} />{t.add}</button></div>
        </div>
      </div>
    </div>
  );
}
