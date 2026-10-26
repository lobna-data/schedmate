'use client';
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { StoreProvider, useStore } from '../lib/store';
import { detectConflicts, conflictSessionIds } from '../lib/conflicts';
import DataManager from '../components/DataManager';
import Timetable from '../components/Timetable';
import ConflictPanel from '../components/ConflictPanel';
import Assistant from '../components/Assistant';
import {
  Upload, Sparkles, Download, FileSpreadsheet, AlertTriangle, Users,
  GraduationCap, Languages, Clock3, Building2, Table2, Database,
} from 'lucide-react';

export default function Home() {
  return <StoreProvider><App /></StoreProvider>;
}

type Tab = 'schedule' | 'data' | 'conflicts';

function App() {
  const s = useStore();
  const [lang, setLang] = useState<'EN' | 'FR'>('EN');
  const [view, setView] = useState<'student' | 'teacher'>('student');
  const [tab, setTab] = useState<Tab>('schedule');
  const [file, setFile] = useState('Demo university data');
  const [generating, setGenerating] = useState(false);
  const [autoFix, setAutoFix] = useStore(s => s.autoFix);
  const [lastFixes, setLastFixes] = useStore(s => s.lastFixes);
  const fixNow = useStore(s => s.fixNow);
  const setAutoFixToggle = useStore(s => s.setAutoFix);

  const fr = lang === 'FR';
  const conflicts = useMemo(() => detectConflicts(s.data, s.sessions), [s.data, s.sessions]);
  const conflictIds = useMemo(() => conflictSessionIds(conflicts), [conflicts]);
  const roomsUsed = new Set(s.sessions.map((x) => x.roomId)).size;

  const t = fr ? {
    sub: 'Assistant de planification universitaire',
    hero: 'Créez des emplois du temps sans conflits.',
    desc: 'Saisissez vos enseignants, modules, groupes et salles — ou importez un Excel. SchedMate génère l’emploi du temps, détecte les conflits et crée des plannings clairs pour les étudiants et les enseignants. Semaine universitaire : samedi Jeudi.',
    upload: 'Importer un fichier Excel', demo: 'Réinitialiser la démo',
    generate: 'Générer l’emploi du temps', generating: 'Génération…',
    student: 'Emploi du temps étudiant', teacher: 'Emploi du temps enseignant',
    conflicts: 'Conflits', classes: 'Cours planifiés', teachers: 'Enseignants', rooms: 'Salles utilisées',
    export: 'Exporter Excel', print: 'Imprimer / PDF',
    schedule: 'Emploi du temps', dataTab: 'Données', conflictsTab: 'Conflits',
    ready: 'Espace de planification', year: 'Année académique • Planning hebdomadaire (sam‑ve)',
    note: 'Planification assistée par IA • corrections automatiques des conflits',
    insightOk: 'Aucun conflit détecté. Le planning respecte les disponibilités, les salles, les capacités et les heures requises.',
    insightBad: (n: number) => `${n} conflit(s) détecté(s). Ouvrez l’onglet Conflits pour voir les détails et corriger.`,
    noData: 'Commencez par l’onglet Données pour saisir vos enseignants, modules, groupes et salles.',
  } : {
    sub: 'University scheduling assistant',
    hero: 'Build conflict-free university timetables.',
    desc: 'Enter your teachers, modules, groups and rooms — or upload an Excel file. SchedMate generates the timetable, detects conflicts, and creates clear schedules for students and teachers. Academic week: Saturday–Thursday.',
    upload: 'Upload Excel file', demo: 'Reset demo data',
    generate: 'Generate timetable', generating: 'Generating…',
    student: 'Student timetable', teacher: 'Teacher timetable',
    conflicts: 'Conflicts', classes: 'Classes scheduled', teachers: 'Teachers', rooms: 'Rooms used',
    export: 'Export Excel', print: 'Print / PDF',
    schedule: 'Timetable', dataTab: 'Data', conflictsTab: 'Conflicts',
    ready: 'Schedule workspace', year: 'Academic year • Weekly schedule (Sat–Thu)',
    note: 'AI-assisted scheduling • auto-fix after every change',
    insightOk: 'No conflicts detected. The schedule respects availability, rooms, capacity and required hours.',
    insightBad: (n: number) => `${n} conflict(s) detected. Open the Conflicts tab for details and fixes.`,
    noData: 'Start in the Data tab to enter your teachers, modules, groups and rooms.',
  };

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        const rows = data.map((x) => ({
          day: String(x.Day ?? x.day ?? ''),
          time: String(x.Time ?? x.time ?? x.Slot ?? x.slot ?? ''),
          teacher: String(x.Teacher ?? x.teacher ?? ''),
          module: String(x.Module ?? x.module ?? x.Course ?? x.course ?? ''),
          group: String(x.Group ?? x.group ?? ''),
          room: String(x.Room ?? x.room ?? ''),
        })).filter((r) => r.day && r.time && r.teacher && r.module && r.group && r.room);
        if (rows.length) {
          s.importRows(rows);
          setTab('schedule');
        }
      } catch { /* invalid file */ }
    };
    reader.readAsArrayBuffer(f);
    e.target.value = '';
  }

  function exportXlsx() {
    const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? '';
    const rows = s.sessions.map((x) => ({
      Day: x.day, Time: x.slot,
      Module: name(s.data.modules, x.moduleId),
      Teacher: name(s.data.teachers, x.teacherId),
      Group: name(s.data.groups, x.groupId),
      Room: name(s.data.rooms, x.roomId),
      Status: conflictIds.has(x.id) ? 'conflict' : 'ok',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timetable');
    if (conflicts.length) {
      const cws = XLSX.utils.json_to_sheet(conflicts.map((c) => ({ Type: c.kind, Detail: c.message })));
      XLSX.utils.book_append_sheet(wb, cws, 'Conflicts');
    }
    XLSX.writeFile(wb, 'university-timetable.xlsx');
  }

  function generate() {
    setGenerating(true);
    setTimeout(() => { s.generate(); setGenerating(false); }, 60);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'schedule', label: t.schedule, icon: <Table2 size={15} /> },
    { id: 'data', label: t.dataTab, icon: <Database size={15} /> },
    { id: 'conflicts', label: t.conflictsTab, icon: <AlertTriangle size={15} />, badge: conflicts.length },
  ];

  return (
    <main>
      <header>
        <div className="brand"><div className="logo"><Sparkles size={18} /></div><div><b>SchedMate</b><span>{t.sub}</span></div></div>
        <div className="header-actions">
          <button className="lang" onClick={() => setLang(fr ? 'EN' : 'FR')}><Languages size={16} />{lang}</button>
          <button className="avatar">S</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">ALGERIAN UNIVERSITY WEEK • SAT–THU</div>
          <h1>{t.hero}</h1>
          <p>{t.desc}</p>
          <div className="actions">
            <label className="primary"><Upload size={18} />{t.upload}<input type="file" accept=".xlsx,.xls,.csv" onChange={upload} /></label>
            <button className="secondary" onClick={() => { s.resetDemo(); setFile('Demo university data'); }}>{t.demo}</button>
          </div>
          <div className="fileline"><FileSpreadsheet size={15} />{file}</div>
        </div>
        <div className="hero-card">
          <div className="mini-top"><span>AI PLANNER</span><span className="pulse"><i /> Ready</span></div>
          <div className="planner">
            <div><small>{t.teachers}</small><strong>{s.data.teachers.length}</strong></div>
            <div><small>{fr ? 'Groupes' : 'Groups'}</small><strong>{s.data.groups.length}</strong></div>
            <div><small>{fr ? 'Salles' : 'Rooms'}</small><strong>{s.data.rooms.length}</strong></div>
            <div><small>{fr ? 'Auto-réparés' : 'Auto-fixed'}</small><strong>{lastFixes.length}</strong></div>
          </div>
          <div className="mini-line"><span>{fr ? 'Moteur de contraintes' : 'Constraint engine'}</span><b>{fr ? 'Actif' : 'Active'}</b></div>
          <div className="mini-line"><span>{fr ? 'Détection de conflits' : 'Conflict checking'}</span><b>{fr ? 'Automatique' : 'Automatic'}</b></div>
        </div>
      </section>

      <section className="workspace">
        <div className="toolbar">
          <div><h2>{t.ready}</h2><p>{t.year}</p></div>
          <button className="generate" onClick={generate} disabled={generating || !s.data.modules.length}>
            <Sparkles size={16} />{generating ? t.generating : t.generate}
          </button>
          <div className="auto-fix-toggle">
            <label>
              <input
                type="checkbox"
                checked={autoFix}
                onChange={(e) => setAutoFixToggle(e.target.checked)}
                disabled={!s.data.modules.length}
                aria-label={fr ? 'Activer la réparation automatique' : 'Enable auto-fix'}
              />
              {fr ? 'Réparation auto' : 'Auto-fix'}
            </label>
          </div>
        </div>

        <div className="stats">
          <Stat icon={<AlertTriangle />} label={t.conflicts} value={conflicts.length} bad={conflicts.length > 0} />
          <Stat icon={<Clock3 />} label={t.classes} value={s.sessions.length} />
          <Stat icon={<Users />} label={t.teachers} value={s.data.teachers.length} />
          <Stat icon={<Building2 />} label={t.rooms} value={roomsUsed} />
          <Stat icon={<Sparkles />} label={fr ? 'Auto-réparés' : 'Auto-fixed'} value={lastFixes.length} />
        </div>

        <div className="viewbar">
          <div className="tabs">
            {tabs.map((x) => (
              <button key={x.id} className={tab === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>
                {x.icon}{x.label}
                {x.badge ? <span className="badge">{x.badge}</span> : null}
              </button>
            ))}
          </div>
          {tab === 'schedule' && (
            <div className="export">
              <button onClick={exportXlsx}><Download size={15} />{t.export}</button>
              <button onClick={() => window.print()}><FileSpreadsheet size={15} />{t.print}</button>
            </div>
          )}
        </div>

        {tab === 'schedule' && (
          <>
            <div className="viewbar sub">
              <div className="tabs">
                <button className={view === 'student' ? 'active' : ''} onClick={() => setView('student')}<GraduationCap size={16} />{t.student}</button>
                <button className={view === 'teacher' ? 'active' : ''} onClick={() => setView('teacher')}<Users size={16} />{t.teacher}</button>
              </div>
            </div>
            <Timetable mode={view} conflictIds={conflictIds} lang={lang} />
          </>
        )}

        {tab === 'data' && <DataManager lang={lang} />}

        {tab === 'conflicts' && <ConflictPanel conflicts={conflicts} lang={lang} autoFix={autoFix} setAutoFix={setAutoFixToggle} lastFixes={lastFixes} fixNow={fixNow} />}

        <div className="insight">
          <div className="insight-icon"><Sparkles size={17} /></div>
          <div>
            <b>{fr ? 'Assistant de planification' : 'Scheduling assistant'}</b>
            <p>
              {tab === 'data' && !s.data.teachers.length ? t.noData
                : conflicts.length ? t.insightBad(conflicts.length)
                : t.insightOk}
            </p>
          </div>
        </div>
      </section>

      <footer>{t.note}<span>SchedMate</span></footer>
      <Assistant lang={lang} />
    </main>
  );
}

function Stat({ icon, label, value, bad }: { icon: React.ReactNode; label: string; value: number; bad?: boolean }) {
  return (
    <div className="stat">
      <div className={bad ? 'stat-icon bad' : 'stat-icon'}>{icon}</div>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}