'use client';
import { Conflict, } from '../lib/types';
import { CONFLICT_LABEL, CONFLICT_LABEL_FR } from '../lib/conflicts';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function ConflictPanel({
  conflicts,
  lang,
  autoFix,
  setAutoFix,
  lastFixes,
  fixNow,
}: {
  conflicts: Conflict[];
  lang: 'EN' | 'FR';
  autoFix: boolean;
  setAutoFix: (on: boolean) => void;
  lastFixes: string[];
  fixNow: () => void;
}) {
  const fr = lang === 'FR';

  // Fix log box
  const fixLog = (
    <div className="fixlog">
      {lastFixes.length > 0 ? (
        <div>
          <b>{fr ? 'Dernières réparations' : 'Last repairs'}</b>
          <ul>
            {lastFixes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          {autoFix ? (
            <p>{fr ? 'Aucune réparation en attente' : 'No repairs pending'}</p>
          ) : (
            <p>{fr ? 'Aucune réparation enregistrée' : 'No repairs recorded'}</p>
          )}
        </div>
      )}
    </div>
  );

  if (!conflicts.length) {
    return (
      <div className="ok-box">
        <CheckCircle2 size={18} />
        <div>
          <b>{fr ? 'Aucun conflit détecté' : 'No conflicts detected'}</b>
          <p>{fr
            ? 'Le planning respecte les contraintes : enseignant, groupe, salle, capacité, type de salle, disponibilité et heures requises.'
            : 'The schedule respects all constraints: teacher, group, room, capacity, room type, availability and required hours.'}</p>
          {autoFix && (
            <p>{fr ? 'Réparation automatique activée — les conflits sont résolus dès qu'ils apparaissent.' : 'Auto-fix enabled — conflicts are repaired as they appear.'}</p>
          )}
        </div>
      </div>
    );
  }

  const byKind = new Map<string, Conflict[]>();
  for (const c of conflicts) {
    const arr = byKind.get(c.kind);
    if (arr) arr.push(c); else byKind.set(c.kind, [c]);
  }

  return (
    <div className="clist">
      {fixLog}
      {[...byKind.entries()].map(([kind, items]) => (
        <section key={kind} className="cgroup">
          <h4>
            <AlertTriangle size={14} />
            {fr ? CONFLICT_LABEL_FR[kind as keyof typeof CONFLICT_LABEL_FR] : CONFLICT_LABEL[kind as keyof typeof CONFLICT_LABEL]}
            <span className="badge">{items.length}</span>
          </h4>
          <ul>
            {items.map((c) => (
              <li key={c.id}>
                {c.message}
                {c.sessionIds.length > 1 && (
                  <span className="muted small"> — {c.sessionIds.length} {fr ? 'cours concernés' : 'classes involved'}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="fix-actions">
        <button onClick={fixNow} disabled={autoFix}>
          {fr ? 'Réparer maintenant' : 'Fix now'}
        </button>
        <label className="switch">
          <input
            type="checkbox"
            checked={autoFix}
            onChange={() => setAutoFix(!autoFix)}
            disabled={conflicts.length === 0}
            aria-label={fr ? 'Activer/désactiver la réparation automatique' : 'Toggle auto-fix'}
          />
          <span className="switch-slider"></span>
        </label>
      </div>
    </div>
  );
}