'use client';
import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { MessageSquare, Send, X } from 'lucide-react';

type Msg = { role: 'user' | 'ai'; text: string };

const EXAMPLES = {
  EN: [
    'Move Dr. Ahmed\'s class from Saturday to Monday afternoon',
    'Find a free room for L2 Algorithms',
    'Which teachers are overloaded this week?',
  ],
  FR: [
    'Déplacer le cours du Dr. Ahmed de samedi à lundi après-midi',
    'Trouver une salle libre pour L2 Algorithmes',
    'Quels enseignants sont surchargés cette semaine ?',
  ],
};

export default function Assistant({ lang }: { lang: 'EN' | 'FR' }) {
  const s = useStore();
  const fr = lang === 'FR';
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  function buildContext() {
    const d = s.data;
    return JSON.stringify({
      settings: d.settings,
      teachers: d.teachers.map((t) => ({ id: t.id, name: t.name, maxHours: t.maxHours, restricted: t.restricted, unavailable: t.restricted ? 'see slots below' : 'none', prefSlots: t.prefSlots, notes: t.notes })),
      modules: d.modules.map((m) => ({ id: m.id, name: m.name, teacherId: m.teacherId, hoursPerWeek: m.hoursPerWeek, groupIds: m.groupIds, roomType: m.roomType })),
      groups: d.groups.map((g) => ({ id: g.id, name: g.name, size: g.size })),
      rooms: d.rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, type: r.type })),
      sessions: s.sessions.map((x) => ({ id: x.id, day: x.day, slot: x.slot, teacherId: x.teacherId, moduleId: x.moduleId, groupId: x.groupId, roomId: x.roomId })),
      unavailableSlots: d.teachers.filter((t) => t.restricted).map((t) => ({ teacherId: t.id, availableKeys: t.availability })),
    }, null, 0);
  }

  async function send(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, context: buildContext() }),
      });
      const data = await res.json().catch(() => ({}));
      let reply: string = data.reply || (res.ok ? '…' : `Error ${res.status}`);
      if (data.action) {
        const a = data.action;
        let err: string | null = null;
        if (a.type === 'move') err = s.moveSession(a.sessionId, a.day, a.slot);
        else if (a.type === 'assign_room') err = s.assignRoom(a.sessionId, a.roomId);
        else if (a.type === 'delete_session') { s.deleteSession(a.sessionId); }
        if (err) reply = `${reply}\n⚠️ ${err}`;
        else if (a.type !== 'delete_session') reply += fr ? '\n✅ Fait — planning mis à jour.' : '\n✅ Done — schedule updated.';
      }
      setMsgs((m) => [...m, { role: 'ai', text: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: 'ai', text: fr ? 'Erreur réseau.' : 'Network error.' }]);
    }
    setBusy(false);
    setTimeout(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }); }, 30);
  }

  return (
    <>
      <button className="fab" onClick={() => setOpen(!open)} title={fr ? 'Assistant IA' : 'AI assistant'}>
        {open ? <X size={19} /> : <MessageSquare size={19} />}
      </button>

      {open && (
        <div className="assistant">
          <div className="a-head">
            <b>{fr ? 'Assistant IA' : 'AI assistant'}</b>
            <span>{fr ? 'Demandez des modifications du planning' : 'Ask to change the schedule'}</span>
          </div>
          <div className="a-msgs" ref={boxRef}>
            {!msgs.length && (
              <div className="a-examples">
                {EXAMPLES[lang].map((x) => (
                  <button key={x} onClick={() => send(x)}>{x}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'a-msg user' : 'a-msg'}>{m.text}</div>
            ))}
            {busy && <div className="a-msg">{fr ? 'Réflexion…' : 'Thinking…'}</div>}
          </div>
          <div className="a-input">
            <input
              value={input}
              placeholder={fr ? 'Ex. : Déplacer le cours du Dr. Ahmed…' : 'e.g. Move Dr. Ahmed\'s class to Monday…'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button onClick={() => send()} disabled={busy}><Send size={15} /></button>
          </div>
        </div>
      )}
    </>
  );
}
