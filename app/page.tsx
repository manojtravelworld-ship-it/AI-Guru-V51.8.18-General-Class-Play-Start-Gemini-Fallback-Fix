import { redirect } from 'next/navigation';

/**
 * AI Guru is the primary experience in this distribution.
 * Keep `/` as a stable entry point so `http://localhost:3000` never lands on
 * Next.js' 404 page; the full classroom remains available at `/ai-guru`.
 */
export default function HomePage() {
  redirect('/ai-guru');
}
