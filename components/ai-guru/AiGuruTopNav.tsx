'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS: Array<{ href: string; label: string; match?: string }> = [
  { href: '/ai-guru', label: 'Dashboard' },
  { href: '/ai-guru', label: 'Live Class' },
  { href: '/ai-guru', label: 'RAG Classroom' },
  { href: '/ai-guru/material-studio', label: 'Material Studio', match: '/ai-guru/material-studio' },
  { href: '/ai-guru', label: 'My Textbooks' },
  { href: '/ai-guru', label: 'Quizzes & Exams' },
  { href: '/ai-guru', label: 'Flashcards' },
  { href: '/ai-guru', label: 'Whiteboard Lab' },
  { href: '/ai-guru', label: 'Progress' },
  { href: '/ai-guru', label: 'Teacher Portal' },
  { href: '/ai-guru', label: 'Parent Portal' },
  { href: '/ai-guru', label: 'Profile' },
  { href: '/ai-guru/settings/gemini', label: 'Settings', match: '/ai-guru/settings' },
  { href: '/ai-guru/settings/local-tts', label: 'Local TTS', match: '/ai-guru/settings/local-tts' },
  { href: '/ai-guru', label: 'Subscription' },
];

export function AiGuruTopNav({ activeLabel }: { activeLabel?: string }) {
  const pathname = usePathname() || '';

  return (
    <header className="sticky top-0 z-50 border-b border-cyan-300/10 bg-[#061321]/95 backdrop-blur">
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2.5 lg:px-5">
        <Link href="/ai-guru" className="mr-2 flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-lg shadow-[0_0_20px_rgba(124,58,237,.35)]">
            ✣
          </span>
          <span className="hidden text-sm font-bold tracking-tight sm:inline">AI Guru</span>
        </Link>
        <nav className="flex min-w-0 flex-1 gap-1">
          {ITEMS.map((item) => {
            const active =
              activeLabel === item.label ||
              (item.match ? pathname.startsWith(item.match) : false) ||
              (item.label === 'Material Studio' && pathname.includes('material-studio')) ||
              (item.label === 'Local TTS' && pathname.includes('local-tts')) ||
              (item.label === 'Settings' && pathname.includes('/settings/gemini'));
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${
                  active
                    ? 'bg-violet-600 text-white shadow-[0_6px_18px_rgba(124,58,237,.28)]'
                    : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export default AiGuruTopNav;
