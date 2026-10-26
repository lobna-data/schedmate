import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'SchedMate — AI Timetable Assistant', description: 'AI-assisted university scheduling for staff and administrators.' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}