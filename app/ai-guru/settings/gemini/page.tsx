'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { AiGuruTopNav } from '@/components/ai-guru/AiGuruTopNav';
import { GeminiKeySetup } from '@/components/ai-guru/GeminiKeySetup';
import { FallbackProviderSetup } from '@/components/ai-guru/FallbackProviderSetup';
import { studentKey, orderedUsableKeys } from '@/lib/student-key';

export default function GeminiBYOKPage(){
  const [usable,setUsable]=useState(0);
  const [saved,setSaved]=useState(0);

  const sync=useCallback(()=>{setUsable(orderedUsableKeys().length);setSaved(studentKey.getAll().length);},[]);
  useEffect(()=>{sync();window.addEventListener('gemini-key-pool-changed',sync);return()=>window.removeEventListener('gemini-key-pool-changed',sync);},[sync]);

  return <main className="min-h-screen bg-[#070a0f] text-white p-0" style={{fontFamily:'Noto Sans, Chilanka, Noto Sans Malayalam, Nirmala UI, sans-serif'}}>
    <AiGuruTopNav activeLabel="Settings" />
    <div className="p-5"><header className="mx-auto flex max-w-5xl items-center justify-between border-b border-white/10 pb-5">
      <div>
        <Link href="/ai-guru/material-studio" className="text-xs text-white/45"><ArrowLeft className="mr-1 inline" size={14}/> Material Studio</Link>
        <h1 className="mt-2 text-2xl font-semibold">Settings · Gemini BYOK</h1>
        <p className="mt-1 text-sm text-white/45">Bring Your Own Gemini Key for AI Guru study-material creation.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/ai-guru/settings/local-tts" className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20">
            Local TTS · Malayalam &amp; English (Piper)
          </Link>
          <a href="https://github.com/rhasspy/piper/releases" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 hover:text-white">
            Download Piper binary ↗
          </a>
          <a href="https://nvda-addons.org/files/get.php?file=hear2read" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-500/20">
            Hear2Read NG (NVDA) ↗
          </a>
        </div>
      </div>
      <KeyRound className="text-cyan-300" size={28}/>
    </header>

    <section className="mx-auto max-w-5xl py-8">
      <div className={`mb-5 rounded-2xl border p-4 text-sm ${usable?'border-emerald-300/20 bg-emerald-300/5 text-emerald-100':'border-amber-300/20 bg-amber-300/5 text-amber-100'}`}>
        {usable
          ? <><Sparkles className="mr-2 inline" size={16}/>Gemini BYOK is active — {usable} of {saved} saved key{saved===1?'':'s'} usable right now. Material Studio will create study materials with these keys and rotate between them automatically.</>
          : <>No usable Gemini key yet. Paste at least one key below before creating study materials.</>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_.8fr]">
        <div>
          <GeminiKeySetup onKeyChanged={sync}/>
          <FallbackProviderSetup/>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-[#10141b] p-6">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="text-cyan-300" size={18}/> How AI Guru uses your keys</div>
          <ol className="mt-4 space-y-4 text-sm text-white/60">
            <li><b className="text-white">1. Save once.</b><br/>Keys stay in this browser. They are never written to the AI Guru database.</li>
            <li><b className="text-white">2. Index the textbook.</b><br/>The uploaded PDF is read page by page, then your key identifies the real chapter boundaries.</li>
            <li><b className="text-white">3. Create materials.</b><br/>Planning, authoring, visuals, assessment and the final QA audit all run on your key pool.</li>
            <li><b className="text-white">4. Automatic rotation.</b><br/>A key that hits its daily quota is benched until tomorrow and generation continues on the next key — long batch runs no longer stop at the first quota error.</li>
            <li><b className="text-white">5. No server key required.</b><br/>Material generation does not depend on <code>GEMINI_API_KEY</code> being configured on the server.</li>
          </ol>
          <div className="mt-5 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-xs leading-5 text-cyan-100">Google controls API-key permissions, quotas and billing for your own project. Adding more keys mainly raises the free daily request ceiling for big textbooks.</div>
        </aside>
      </div>
    </section>
  </div></main>;
}
