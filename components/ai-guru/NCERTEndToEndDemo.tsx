'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MathLikeAnimBoard, { type MathLikeAnimBoardHandle } from './MathLikeAnimBoard';
import type { AIGuruLesson, LanguageTrack, VisualAction } from '@/lib/ai-guru/lesson/types';
import { ncertClass10QuadraticLesson, NCERT_CLASS10_CH4_SOURCE } from '@/lib/ai-guru/e2e/ncert-class10';
import { createLanguagePass, createTwoPassSequence } from '@/lib/ai-guru/lesson/language-pass';

const languageName = (l: LanguageTrack) => l === 'english' ? 'English' : 'മലയാളം';

// A teaching checkpoint is a complete mathematical line, not an individual
// renderer action. This keeps highlights/transforms attached to the line they
// explain while the derivation itself remains cumulative.
type DerivationLine = {
  id: string;
  expression: string;
  captionId: string;
  actionIds: string[];
  y: number;
};

function buildDerivationLines(actions: VisualAction[]): DerivationLine[] {
  const latex = actions.filter((a): a is Extract<VisualAction, { type: 'latex' }> => a.type === 'latex');
  return latex.map((line, index) => {
    const actionIds = [line.id];
    const related = actions.filter((a) => {
      if (a.type === 'transform' && a.toId === line.id) return true;
      if (a.type === 'highlight' && a.targetId === line.id) return true;
      return false;
    });
    related.forEach(a => actionIds.push(a.id));
    return {
      id: `derivation-${index + 1}`,
      expression: line.latex,
      captionId: related.find(a => a.type === 'highlight')?.id ?? line.id,
      actionIds,
      y: line.y ?? (95 + index * 105),
    };
  });
}

export default function NCERTEndToEndDemo() {
  const lesson = ncertClass10QuadraticLesson as AIGuruLesson;
  const paragraph = lesson.paragraphs[0];
  const english = useMemo(() => createLanguagePass('english', paragraph.english, paragraph.english.captions ?? {}), [paragraph]);
  const malayalam = useMemo(() => createLanguagePass('malayalam', { ...paragraph.malayalam, visuals: paragraph.english.visuals }, paragraph.malayalam.captions ?? {}), [paragraph]);
  const passes = useMemo(() => createTwoPassSequence(english, malayalam), [english, malayalam]);
  const lines = useMemo(() => buildDerivationLines(paragraph.english.visuals), [paragraph.english.visuals]);

  const [passIndex, setPassIndex] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'english' | 'malayalam' | 'done'>('idle');
  const [shown, setShown] = useState<string[]>([]);
  const [active, setActive] = useState<string>();
  const [caption, setCaption] = useState('');
  const [currentLine, setCurrentLine] = useState(-1);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [learned, setLearned] = useState<number[]>([]);
  const [status, setStatus] = useState('Ready');
  const stopRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const boardRef = useRef<MathLikeAnimBoardHandle | null>(null);

  useEffect(() => () => { stopRef.current?.(); audioRef.current?.pause(); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);

  const revealAction = async (action: VisualAction, pass: LanguageTrack) => {
    setShown(s => s.includes(action.id) ? s : [...s, action.id]);
    setActive(action.id);
    setCaption((pass === 'english' ? paragraph.english.captions : paragraph.malayalam.captions)?.[action.id] ?? '');
    await boardRef.current?.reveal(action);
  };

  const speakCaption = async (text: string, language: LanguageTrack) => {
    if (!text) return;
    const langCode = language === 'malayalam' ? 'ml-IN' : 'en-IN';
    audioRef.current?.pause();
    audioRef.current = null;
    for (const provider of language === 'malayalam' ? ['sarvam', 'piper'] : ['sarvam']) {
      try {
        const response = await fetch(`/api/ai-guru/${provider}-tts`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, languageCode: langCode, speaker: language === 'malayalam' ? 'shubh' : undefined }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.result?.audioBase64) continue;
        await new Promise<void>((resolve) => {
          const audio = new Audio(`data:audio/${payload.result.format};base64,${payload.result.audioBase64}`);
          audioRef.current = audio;
          audio.onended = () => { audioRef.current = null; resolve(); };
          audio.onerror = () => { audioRef.current = null; resolve(); };
          void audio.play().catch(() => { audioRef.current = null; resolve(); });
        });
        return;
      } catch { /* continue to fallback */ }
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langCode;
        utterance.rate = language === 'malayalam' ? 0.78 : 0.84;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }
  };

  const resetPass = () => {
    stopRef.current?.();
    boardRef.current?.reset();
    setShown([]);
    setActive(undefined);
    setCaption('');
    setCurrentLine(-1);
    setPausedAt(null);
    setLearned([]);
  };

  const revealLine = async (lineIndex: number, language: LanguageTrack) => {
    const line = lines[lineIndex];
    if (!line) return;
    const pass = passes.find(p => p.language === language) ?? passes[passIndex];
    setCurrentLine(lineIndex);
    setPausedAt(null);
    setStatus(`${languageName(language)} · building step ${lineIndex + 1} of ${lines.length}`);

    // Build the line from its semantic actions. The completed derivation stays
    // visible; only the current line receives active emphasis.
    for (const actionId of line.actionIds) {
      const action = pass.visualSequence.find(a => a.id === actionId);
      if (action) await revealAction(action, language);
    }

    // Keep the caption for the mathematical line itself visible. If the line has
    // a highlight, its caption is more useful; otherwise use the line caption.
    const lineCaption = (language === 'english' ? paragraph.english.captions : paragraph.malayalam.captions)?.[line.id]
      ?? (language === 'english' ? paragraph.english.captions : paragraph.malayalam.captions)?.[line.captionId];
    if (lineCaption) setCaption(lineCaption);
    // The voice for each line completes before the learning checkpoint appears.
    // This prevents the learner from advancing while narration is still speaking.
    await speakCaption(lineCaption ?? '', language);
    setPausedAt(lineIndex);
    setStatus(`${languageName(language)} · paused at step ${lineIndex + 1} · click # when learned`);
  };

  const startPass = async (index: number) => {
    stopRef.current?.();
    const language = passes[index].language;
    setPassIndex(index);
    setPhase(language);
    boardRef.current?.reset();
    setShown([]); setActive(undefined); setCaption(''); setCurrentLine(-1); setPausedAt(null); setLearned([]);
    setStatus(`${languageName(language)} · ready`);
    // Pass the explicit language/index into the reveal path so React state
    // batching cannot accidentally reveal line 1 using the previous pass.
    const line = lines[0];
    if (!line) return;
    setCurrentLine(0);
    setStatus(`${languageName(language)} · building step 1 of ${lines.length}`);
    const pass = passes[index];
    for (const actionId of line.actionIds) {
      const action = pass.visualSequence.find(a => a.id === actionId);
      if (action) await revealAction(action, language);
    }
    const captions = language === 'english' ? paragraph.english.captions : paragraph.malayalam.captions;
    const lineCaption = captions?.[line.id] ?? captions?.[line.captionId] ?? '';
    setCaption(lineCaption);
    await speakCaption(lineCaption, language);
    setPausedAt(0);
    setStatus(`${languageName(language)} · paused at step 1 · click # when learned`);
  };

  const markAndAdvance = async (index: number) => {
    if (currentLine !== index || pausedAt !== index) return;
    if (!learned.includes(index)) {
      setLearned(prev => [...prev, index]);
      if (index === lines.length - 1) {
        const language = passes[passIndex].language;
        setStatus(`${languageName(language)} · derivation learned`);
        if (language === 'english') {
          window.setTimeout(() => { void startPass(1); }, 700);
        } else {
          setPhase('done');
          setStatus('Both language passes complete');
        }
        return;
      }
      // Give the learner an explicit moment to register the completed line.
      window.setTimeout(() => { void revealLine(index + 1, passes[passIndex].language); }, 220);
    } else if (index < lines.length - 1) {
      await revealLine(index + 1, passes[passIndex].language);
    }
  };

  const teachBoth = async () => {
    stopRef.current?.();
    setPhase('english');
    setStatus('English · reading textbook paragraph');
    await speakCaption(paragraph.source.text, 'english');
    await startPass(0);
  };

  const repeat = async () => {
    // Repeat the CURRENT language pass from line 1. This is intentionally not a
    // language switch: the learner can rehearse one complete explanation.
    await startPass(passIndex);
  };

  const nextPass = async () => {
    if (passIndex === 0) {
      await startPass(1);
    } else {
      setPhase('done');
      setStatus('Both language passes complete');
      setPausedAt(null);
    }
  };

  const stop = () => {
    stopRef.current?.();
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    resetPass();
    setPhase('idle');
    setPassIndex(0);
    setStatus('Stopped');
  };

  const current = passes[passIndex];

  return <main className="min-h-screen bg-[#070a0f] p-4 text-white">
    <div className="mx-auto max-w-7xl">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[.22em] text-cyan-300/70">AI Guru · Two-Pass Teaching · Learn-by-Line</div>
          <h1 className="text-2xl font-semibold">NCERT Class 10 · Quadratic Equations</h1>
          <p className="text-sm text-white/45">Each derived line stays visible. Click # after you understand it to unlock the next line.</p>
        </div>
        <a href={NCERT_CLASS10_CH4_SOURCE} target="_blank" rel="noreferrer" className="rounded-xl bg-white/10 px-3 py-2 text-xs">Official NCERT Chapter 4 ↗</a>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_280px]">
        <section className="relative min-h-[680px] overflow-hidden rounded-2xl border border-white/10 bg-white">
          <div className="absolute left-3 top-3 z-10 rounded-full bg-black/75 px-3 py-1 text-xs">PDF Reference · textbook p. 78</div>
          <iframe title="NCERT Class 10 Mathematics Chapter 4" src={`${NCERT_CLASS10_CH4_SOURCE}#page=9&view=FitH`} className="h-[680px] w-full" />
        </section>

        <section className="min-h-[680px] rounded-2xl border border-cyan-300/10 bg-[#0b1017] p-3">
          <div className="mb-2 flex justify-between text-xs text-white/45">
            <span>Whiteboard · {phase === 'malayalam' ? 'മലയാളം' : 'English'}</span>
            <span>{status}</span>
          </div>
          <div className="grid h-[610px] grid-cols-[58%_42%] overflow-hidden rounded-xl border border-white/5">
            <div className="relative min-w-0 overflow-hidden">
              <MathLikeAnimBoard ref={boardRef} items={paragraph.english.visuals.filter(v => shown.includes(v.id))} active={active} />
            </div>
            <div className="min-w-0 overflow-y-auto border-l border-white/10 bg-black/20 p-2">
              <div className="mb-2 rounded-lg border border-white/10 bg-white/[.03] px-2 py-1 text-[9px] uppercase tracking-[.16em] text-white/35">Step explanation</div>
              <div className="space-y-2">
                {lines.map((line, index) => {
                  const visible = index <= currentLine;
                  if (!visible) return null;
                  const isCurrent = currentLine === index;
                  const isLearned = learned.includes(index);
                  const lineCaption = (phase === 'malayalam' ? paragraph.malayalam.captions : paragraph.english.captions)?.[line.id]
                    ?? (phase === 'malayalam' ? paragraph.malayalam.captions : paragraph.english.captions)?.[line.captionId]
                    ?? '';
                  return <div key={line.id} className={`rounded-xl border p-2 transition ${isCurrent ? 'border-cyan-300/35 bg-cyan-300/[.07]' : 'border-white/10 bg-white/[.025] opacity-75'}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] uppercase tracking-[.16em] text-cyan-300/55">Step {index + 1}</div>
                        <div className="mt-1 break-words text-[12px] leading-5 text-white/90">{lineCaption}</div>
                      </div>
                      <button
                        aria-label={`${isLearned ? 'Learned' : 'Mark learned'} step ${index + 1}`}
                        onClick={() => void markAndAdvance(index)}
                        className={`pointer-events-auto shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold transition ${isLearned ? 'border-emerald-300/60 bg-emerald-300/15 text-emerald-200' : 'border-cyan-300/50 bg-black/85 text-cyan-100 hover:bg-cyan-300/15'}`}
                        title={isLearned ? (index === lines.length - 1 ? 'Final line learned' : 'Click again to show the next line') : 'Click when you understand this line'}
                      >{isLearned ? '# ✓' : '#'}</button>
                    </div>
                  </div>;
                })}
              </div>
            </div>
            <div className="sr-only" aria-live="polite">{caption}</div>
          </div>
        </section>

        <aside className="rounded-2xl border border-white/10 bg-[#10141b] p-4">
          <div className="text-xs text-white/40">Teaching controller</div>
          <div className="mt-3 rounded-xl bg-white/5 p-3 text-xs">
            <div>Source: <b>NCERT</b></div><div className="mt-1">Class: <b>10</b></div>
            <div className="mt-1">Chapter: <b>4 · Quadratic Equations</b></div><div className="mt-1">Domain: <b>Algebra</b></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className={`rounded-lg px-2 py-2 ${phase === 'english' ? 'bg-cyan-300/15 text-cyan-100' : 'bg-white/5 text-white/45'}`}>① English</div>
            <div className={`rounded-lg px-2 py-2 ${phase === 'malayalam' ? 'bg-cyan-300/15 text-cyan-100' : 'bg-white/5 text-white/45'}`}>② മലയാളം</div>
          </div>

          <button onClick={() => void teachBoth()} className="mt-3 w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-black">▶ Start English → Malayalam</button>
          <button onClick={() => void repeat()} className="mt-2 w-full rounded-xl bg-white/10 px-4 py-2 text-xs">↻ Repeat current pass</button>
          <button onClick={() => void nextPass()} disabled={phase === 'idle' || currentLine < lines.length - 1 || !learned.includes(lines.length - 1)} className="mt-2 w-full rounded-xl bg-white/10 px-4 py-2 text-xs disabled:opacity-30">→ Next language</button>
          <button onClick={stop} className="mt-2 w-full rounded-xl bg-white/10 px-4 py-2 text-xs">■ Stop</button>

          <div className="mt-4 rounded-xl border border-white/10 p-3 text-xs text-white/55">
            <div className="font-medium text-white/80">Audio synchronization</div>
            <div className="mt-1">Each line waits for its narration to finish before the <b>#</b> checkpoint is enabled.</div>
            <div className="mt-1 text-white/35">Provider fallback: Sarvam → Piper → device speech.</div>
          </div>

          <div className="mt-4 text-xs text-white/50">
            <div>Current: <span className="text-white">{currentLine >= 0 ? `${currentLine + 1} / ${lines.length}` : 'Not started'}</span></div>
            <div className="mt-2">Learned: <span className="text-emerald-200">{learned.length} / {lines.length}</span></div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 p-3 text-xs text-white/55">
            <div className="font-medium text-white/80">Cumulative derivation</div>
            {lines.map((line, index) => <div key={line.id} className={`mt-2 flex items-center justify-between rounded-lg px-2 py-1 ${index <= currentLine ? 'bg-cyan-300/10 text-cyan-100' : 'bg-white/[.03]'}`}>
              <span>{index + 1}. {line.expression.replace(/\\/g, '')}</span>
              <span className="ml-2">{learned.includes(index) ? '✓' : index === currentLine ? '#' : ''}</span>
            </div>)}
          </div>

          <div className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/5 p-3 text-[11px] leading-5 text-amber-100/70">
            <b>Learning checkpoint:</b> AI Guru stops after every derived line. Click <b>#</b> when the student has understood that line. The next line is then constructed underneath it. The final # remains visible on the last line.
          </div>
        </aside>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-300/10 bg-emerald-300/5 p-3 text-xs text-emerald-100/70">
        <b>Two-pass rule:</b> English is taught completely, one line at a time. The scene is then reset and the identical verified derivation is replayed completely in Malayalam, with independent Malayalam captions and voice timing.
      </div>
    </div>
  </main>;
}
