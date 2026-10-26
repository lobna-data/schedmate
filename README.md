# SchedMate — AI Timetable Assistant

A Next.js app for university staff to plan and manage timetables for all teacher types — with conflict detection, auto-fix after every change, Excel import/export, and a Gemini-powered AI assistant. Designed for the Algerian university system (week: Saturday → Thursday, Friday off).

## Features

### Manual input (Data tab)
- **Teachers** — name, max hours/week, restricted availability (day × slot matrix), preferred slots, notes
- **Modules / courses** — name, teacher, required sessions per week, assigned student groups, room type (classroom/lab)
- **Student groups** — name and size
- **Rooms** — name, capacity, type (classroom/lab)
- **Days & slots** — configure the working week and time slots (Saturday–Thursday by default)

### Generate timetable
- Constraint solver: teacher availability, no teacher/group/room double-booking, room capacity, room type, teacher weekly hour cap
- Soft preferences: preferred slots, balanced days, best-fit rooms

### Conflict detection (6 checks)
1. Teacher double-booked
2. Room double-booked
3. Group double-booked
4. Room capacity / room type problems
5. Teacher unavailable
6. Missing required hours

### Auto-fix (after every change)
- Automatic conflict repair following any data edit, generation, or import
- Fix log shows every repair made (with reason: moved, reassigned room, etc.)
- Toggle ON/OFF — keep auto-fix enabled for conflict-free schedules, or disable to review conflicts manually
- "Fix now" button to repair immediately when auto-fix is off

### Views & export
- Student timetable (per group) and Teacher timetable (per teacher) as weekly grids
- Export **Excel** (with a Conflicts sheet) and **Print / Save as PDF**

### AI assistant (bottom-right button)
- Ask in English or French: *"Move Dr. Ahmed's class from Saturday to Monday afternoon"* → the assistant actually moves it (validated against conflicts before applying)
- *"Find a free room for L2 Algorithms"* → assigns a room
- Analysis questions: overloaded teachers, free rooms, etc.

### EN / FR interface
- Full interface translation in both English and French
- Day names and conflict labels localized

## Setup

```bash
npm install
```

Create `.env.local`:

```
GEMINI_API_KEY=your_key_here        # https://aistudio.google.com/apikey
```

Run locally:

```bash
npm run dev
```

Open http://localhost:3000

> Without the key the app still works — only the AI assistant shows a "not configured" message.

## Deploy to Vercel

1. Push this folder to GitHub → import in Vercel (auto-detects Next.js).
2. **Project → Settings → Environment Variables**: add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`).
3. Deploy / redeploy.

## Data storage

All data (teachers, modules, groups, rooms, timetable) is saved in the **browser's local storage** (per staff member, survives refresh). "Reset demo data" restores the sample dataset. Shared/central database can be added later.

## Excel format

Header row (case-insensitive): `Day, Time, Teacher, Module, Group, Room`

Example rows:

```
Day,Time,Teacher,Module,Group,Room
Saturday,08:00–09:30,Dr. Ahmed Benali,Database Systems,L2-G1,Lab 2
```

## Project structure

```
app/page.tsx               Main UI (hero, workspace, tabs)
app/api/assistant/route.ts Gemini AI assistant endpoint
components/DataManager.tsx Manual input forms (teachers/modules/groups/rooms/settings)
components/Timetable.tsx   Weekly grid per group / per teacher
components/ConflictPanel.tsx Conflict list grouped by type + auto-fix UI
components/Assistant.tsx   Chat widget (can move classes / assign rooms)
lib/types.ts               Data model
lib/store.tsx              State + localStorage persistence + auto-fix
lib/scheduler.ts           Timetable generation (constraint solver)
lib/conflicts.ts           The 6 conflict checks + FR labels
lib/autofix.ts             Auto-fix engine (port from desktop)
lib/demo.ts                Demo dataset (Algerian week Sat–Thu)
```