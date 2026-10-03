'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { AIGuruTeachingLesson, TeachingBeat } from '@/lib/ai-guru/math/teaching/types';
import type { MathVisualNode, UniversalMathScene } from '@/lib/ai-guru/math/universal/types';
import { createRuntimeSnapshot, sceneDurationMs, type RuntimeNodeState } from '@/lib/ai-guru/math/animation/runtime';

export interface ThreeB1BTeachingBoardProps {
  question: string;
  grade: number;
  language: 'english' | 'malayalam';
  apiKey?: string;
  apiKeys?: string[];
  chapterTitle?: string;
  chapterSummary?: string;
  chapterTopics?: string[];
  textbookContext?: string;
  /** Structured page/cue manifest for Teacher-Reading Mode. */
  textbookPageJson?: string;
  teacherReadingMode?: boolean;
  /** Optional pre-generated bilingual material used by the emergency local fallback. */
  teacherSourceMalayalam?: string;
  teacherExplanationEnglish?: string;
  teacherExplanationMalayalam?: string;
  bilingualTeaching?: boolean;
  onSourceCue?: (cueId: string | null) => void;
  onClose?: () => void;
  onCue?: (text: string, language: 'english' | 'malayalam') => void;
  /** Start the lesson automatically after the verified scene is loaded. */
  autoPlay?: boolean;
  onStatus?: (status: 'planning' | 'ready' | 'playing' | 'completed' | 'error', detail?: string) => void;
  /** The student's saved Sarvam BYOK key; lets the Sarvam voice work without a server-side SARVAM_API_KEY. */
  sarvamApiKey?: string;
  /** Human-readable progress/notice lines (voice fallbacks, silent mode) for the classroom log. */
  onNotice?: (message: string, level: 'info' | 'ok' | 'warn' | 'err') => void;
  onComplete?: () => void;
}

type LessonResponse = { ok: boolean; lesson: AIGuruTeachingLesson; scene: UniversalMathScene; quality?: AIGuruTeachingLesson['quality']; warnings?: string[] };
type WordTiming = { word: string; startMs: number; endMs: number; source?: 'provider' | 'measured-audio' };
type AudioClip = { beatId: string; audio: HTMLAudioElement; durationMs: number; words: WordTiming[]; provider: string; /** true = no voice could be produced; the class plays on captions + visuals */ silent?: boolean };
type BeatWindow = { beat: TeachingBeat; startMs: number; endMs: number };
type SpeechCue = { id: string; beat: TeachingBeat; text: string; language: 'english'|'malayalam'; phase: number; phaseCount: number; window: BeatWindow };

function palette(scene: UniversalMathScene) {
  const id = scene.visualStyle?.id || '';
  if (id.includes('geometry')) return { ink: '#e8f4f8', accent: '#7dd3fc', fill: 'rgba(134,239,172,.18)', emphasis: '#facc15' };
  if (id.includes('calculus')) return { ink: '#e8f4f8', accent: '#60a5fa', fill: 'rgba(96,165,250,.18)', emphasis: '#fbbf24' };
  return { ink: '#e6faff', accent: '#67e8f9', fill: 'rgba(103,232,249,.12)', emphasis: '#fbbf24' };
}

function Node({ n, active, p }: { n: MathVisualNode | RuntimeNodeState; active: boolean; p: ReturnType<typeof palette> }) {
  const rn = n as RuntimeNodeState;
  const stroke = rn.highlighted ? p.emphasis : p.accent;
  const opacity = rn.opacity ?? (active ? 1 : .96);
  const transform = `translate(${n.x ?? 0} ${n.y ?? 0}) scale(${rn.scale ?? 1}) rotate(${rn.rotation ?? 0})`;
  const common = { opacity, transform, transformOrigin: '0 0', style: { transition: 'opacity 120ms linear' } as CSSProperties };
  if (n.kind === 'text' || n.kind === 'latex' || n.kind === 'transform') {
    return <text {...common} x={0} y={0} fontSize={Number(n.style?.fontSize ?? 38)} fill={p.ink} dominantBaseline="hanging" fontFamily={n.kind === 'latex' ? 'serif' : 'Chilanka, Noto Sans Malayalam, Nirmala UI, sans-serif'}>{n.latex ?? n.content ?? n.to ?? ''}</text>;
  }
  if (n.kind === 'point') return <circle {...common} cx={0} cy={0} r={Number(n.style?.radius ?? 8)} fill={stroke} />;
  if (n.kind === 'line' || n.kind === 'arrow') {
    const x1 = (n.startX ?? n.x ?? 0) - (n.x ?? 0), y1 = (n.startY ?? n.y ?? 0) - (n.y ?? 0);
    const x2 = (n.endX ?? ((n.x ?? 0) + (n.width ?? 100))) - (n.x ?? 0), y2 = (n.endY ?? n.y ?? 0) - (n.y ?? 0);
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const progress = rn.opacity > 0.01 ? 1 : 0;
    return <line {...common} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={Number(n.style?.strokeWidth ?? 4)} strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - progress)} style={{ transition: 'stroke-dashoffset 500ms ease, opacity 120ms linear' }} />;
  }
  if (n.kind === 'shape') {
    const w = n.width ?? 100, h = n.height ?? 100;
    const fill = n.style?.fill && n.style.fill !== 'none' ? String(n.style.fill) : 'none';
    if (n.shape === 'circle') return <ellipse {...common} cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={fill} stroke={stroke} strokeWidth={Number(n.style?.strokeWidth ?? 4)} />;
    if (n.shape === 'triangle') return <polygon {...common} points={`${w / 2},0 0,${h} ${w},${h}`} fill={fill} stroke={stroke} strokeWidth={Number(n.style?.strokeWidth ?? 4)} />;
    return <rect {...common} x={0} y={0} width={w} height={h} rx={Number(n.style?.radius ?? 0)} fill={fill} stroke={stroke} strokeWidth={Number(n.style?.strokeWidth ?? 4)} />;
  }
  if (n.kind === 'highlight') return <rect {...common} x={n.x ?? 0} y={n.y ?? 0} width={n.width ?? 120} height={n.height ?? 60} fill={p.emphasis} opacity={(rn.opacity ?? .2) * .35} rx={10} />;
  if (n.kind === 'graph' && n.graph?.x?.length) {
    const pts = n.graph.x.map((x, i) => `${x},${n.graph?.y?.[i] ?? 0}`).join(' ');
    return <polyline {...common} points={pts} fill="none" stroke={stroke} strokeWidth={3} />;
  }
  return null;
}

function normalizeMalayalamSpeech(text: string): string {
  // Keep the displayed Malayalam natural, but make TTS pronounce mathematical
  // symbols and common technical vocabulary in English. This is deliberately
  // conservative; it only protects terms that are frequently mangled by
  // Malayalam voices.
  return String(text || '')
    .replace(/(\d)([xyzabc])\b/gi, '$1 $2')
    .replace(/(?<![A-Za-z0-9])([xyzabc])(?=\s|$|[,.!?])/gi, (_, v) => ` ${({x:'ex', y:'why', z:'zee', a:'ay', b:'bee'} as Record<string,string>)[String(v).toLowerCase()] || String(v).toLowerCase()} `)
    .replace(/\b(വേരിയബിൾ|ചരം)\b/gi, 'variable')
    .replace(/\b(സമവാക്യം|സമവാക്യങ്ങൾ)\b/gi, 'equation')
    .replace(/\b(ഗുണകം|കോഎഫിഷ്യന്റ്)\b/gi, 'coefficient')
    .replace(/\b(സ്ഥിരാങ്കം)\b/gi, 'constant')
    .replace(/\b(പദം|പദങ്ങൾ)\b/gi, 'term')
    .replace(/\b(പ്രകടനം)\b/gi, 'expression')
    .replace(/\b(പകരംവയ്ക്കൽ|പകരം വയ്ക്കൽ)\b/gi, 'substitution')
    .replace(/\b(പരിഹാരം|പരിഹരിക്കുക)\b/gi, 'solution')
    .replace(/\b(ഗ്രാഫ്)\b/gi, 'graph')
    .replace(/\b(ചരിവ്)\b/gi, 'slope')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function phraseMatches(words: WordTiming[], phrase: string): WordTiming | undefined {
  const wanted = phrase.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!wanted.length) return undefined;
  for (let i = 0; i <= words.length - wanted.length; i++) {
    const got = words.slice(i, i + wanted.length).map(w => w.word.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
    if (got.join(' ') === wanted.join(' ')) return words[i];
  }
  return undefined;
}

export default function ThreeB1BTeachingBoard({ question, grade, language, apiKey, apiKeys = [], chapterTitle, chapterSummary, chapterTopics, textbookContext, textbookPageJson, teacherReadingMode = false, teacherSourceMalayalam, teacherExplanationEnglish, teacherExplanationMalayalam, bilingualTeaching = true, onSourceCue, onClose, onCue, autoPlay = false, onStatus, onComplete, sarvamApiKey, onNotice }: ThreeB1BTeachingBoardProps) {
  const [data, setData] = useState<LessonResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Voice sync idle');
  const [cue, setCue] = useState<{ text: string; language: 'english' | 'malayalam' } | null>(null);
  const rafRef = useRef<number | null>(null);
  const clipsRef = useRef<AudioClip[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopSessionRef = useRef(false);
  const sessionRunningRef = useRef(false);
  const cueFiredRef = useRef(new Set<string>());
  const autoPlayedRef = useRef(false);
  /** Voice providers that already failed this session: later clips skip them instead of waiting 8s on each again. */
  const deadProvidersRef = useRef(new Set<string>());
  const sarvamKeyRef = useRef<string | undefined>(sarvamApiKey);
  sarvamKeyRef.current = sarvamApiKey;
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  const scene = data?.scene;
  const total = scene ? sceneDurationMs(scene) : 0;
  const snapshot = useMemo(() => scene ? createRuntimeSnapshot(scene, timeMs) : null, [scene, timeMs]);
  const nodes = snapshot ? [...snapshot.nodes.values()] : [];

  const beats = useMemo<BeatWindow[]>(() => {
    if (!scene || !data) return [];
    const authored = data.lesson.segments.slice().sort((a, b) => a.order - b.order).flatMap(s => s.beats);
    const authoredById = new Map<string, TeachingBeat>(authored.map(beat => [beat.id, beat]));
    // The compiler adds the human-teacher narrative (opening question, why it matters,
    // prerequisites, running example, intuition, mathematics and final insight) to
    // scene.narrationCues. Use that single cue stream for TTS so the board teaches the
    // whole lesson, while the SVG remains a clean visual canvas.
    return scene.narrationCues
      .slice()
      .sort((a, b) => a.atMs - b.atMs)
      .map((cue, i, cues) => {
        const sourceId = cue.id.startsWith('cue:') ? cue.id.slice(4) : cue.id;
        const authoredBeat = authoredById.get(sourceId);
        const startMs = Math.max(0, Number(cue.atMs) || 0);
        const nextAt = i + 1 < cues.length ? Math.max(startMs + 1, Number(cues[i + 1].atMs) || startMs + 1200) : sceneDurationMs(scene);
        const fallbackWords = String(cue.text || '').split(/\s+/).filter(Boolean).slice(0, 6);
        const beat: TeachingBeat = {
          ...(authoredBeat || {}),
          id: sourceId,
          narration: String(cue.text || ''),
          cueWords: authoredBeat?.cueWords?.length ? authoredBeat.cueWords : fallbackWords,
          durationMs: Math.max(900, nextAt - startMs),
          visualIntent: authoredBeat?.visualIntent || 'pause',
          targetObjects: authoredBeat?.targetObjects || (cue.targetId ? [cue.targetId] : []),
          actions: authoredBeat?.actions?.length ? authoredBeat.actions : [{ type: 'pause', durationMs: Math.min(900, Math.max(250, nextAt - startMs)) }],
        };
        return { beat, startMs, endMs: Math.max(startMs + 1, nextAt) };
      })
      .filter(window => window.beat.narration.trim());
  }, [scene, data]);

  const speechCues = useMemo<SpeechCue[]>(() => {
    if (!data) return [];
    const authored = data.lesson.segments.slice().sort((a, b) => a.order - b.order).flatMap(s => s.beats);
    const windowById = new Map<string, BeatWindow>(beats.map((w: BeatWindow) => [w.beat.id, w] as [string, BeatWindow]));
    if (!teacherReadingMode) {
      return beats.map((window, i) => ({
        id: `speech:${window.beat.id}:${i}`,
        beat: window.beat,
        text: window.beat.narration,
        language,
        phase: 0,
        phaseCount: 1,
        window,
      }));
    }
    const out: SpeechCue[] = [];
    const addBilingual = (prefix: string, beat: TeachingBeat, window: BeatWindow, speech?: { en: string; ml: string }) => {
      if (!speech) return;
      const entries: Array<[string, 'english'|'malayalam']> = [];
      if (speech.en?.trim()) entries.push([speech.en.trim(), 'english']);
      if (speech.ml?.trim()) entries.push([speech.ml.trim(), 'malayalam']);
      const phaseCount = Math.max(1, entries.length);
      entries.forEach(([text, speechLanguage], phase) => out.push({
        id: `speech:${prefix}:${phase}`,
        beat,
        text,
        language: speechLanguage,
        phase,
        phaseCount,
        window,
      }));
    };
    const openingWindow = windowById.get('narrative:opening');
    const whyWindow = windowById.get('narrative:why');
    if (openingWindow) addBilingual('opening', openingWindow.beat, openingWindow, data.lesson.openingTeacher);
    if (whyWindow) addBilingual('why', whyWindow.beat, whyWindow, data.lesson.whyItMattersTeacher);
    for (const beat of authored) {
      if (!beat.sourceCueId) continue;
      const window = windowById.get(beat.id);
      if (!window) continue;
      const entries: Array<[string, 'english'|'malayalam']> = [];
      if (bilingualTeaching) {
        if (beat.read?.en?.trim()) entries.push([beat.read.en.trim(), 'english']);
        if (beat.read?.ml?.trim()) entries.push([beat.read.ml.trim(), 'malayalam']);
        if (beat.explain?.en?.trim()) entries.push([beat.explain.en.trim(), 'english']);
        if (beat.explain?.ml?.trim()) entries.push([beat.explain.ml.trim(), 'malayalam']);
        if (beat.checkQuestion?.en?.trim()) entries.push([beat.checkQuestion.en.trim(), 'english']);
        if (beat.checkQuestion?.ml?.trim()) entries.push([beat.checkQuestion.ml.trim(), 'malayalam']);
      } else {
        const selected = language === 'malayalam' ? beat.explain?.ml || beat.read?.ml : beat.explain?.en || beat.read?.en;
        if (selected?.trim()) entries.push([selected.trim(), language]);
      }
      const phaseCount = Math.max(1, entries.length);
      entries.forEach(([text, speechLanguage], phase) => {
        out.push({
          id: `speech:${beat.id}:${phase}`,
          beat,
          text,
          language: speechLanguage,
          phase,
          phaseCount,
          window,
        });
      });
    }
    if (out.length) return out;
    // Graceful fallback for an older/cached lesson that has no structured
    // Teacher-Reading fields. It still plays the visual lesson rather than
    // leaving the class apparently stopped.
    return beats.map((window, i) => ({
      id: `speech:fallback:${window.beat.id}:${i}`,
      beat: window.beat,
      text: window.beat.narration,
      language,
      phase: 0,
      phaseCount: 1,
      window,
    }));
  }, [beats, bilingualTeaching, data, language, teacherReadingMode]);

  const load = useCallback(async () => {
    setBusy(true); onStatus?.('planning'); setError(''); setPlaying(false); setVoiceReady(false); setVoiceStatus('Voice sync idle');
    deadProvidersRef.current = new Set();
    clipsRef.current.forEach(c => { c.audio.pause(); c.audio.src = ''; }); clipsRef.current = [];
    try {
      const keys = [...new Set([apiKey, ...apiKeys].map(k => String(k || '').trim()).filter(Boolean))];
      if (!keys.length) throw new Error('No Gemini API key is available for 3B1B planning. Add/validate a Gemini key in AI Guru Settings.');
      let lastError = '3B1B lesson planning failed.';
      let succeeded = false;
      for (const candidateKey of keys) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 18000);
        try {
          const r = await fetch('/api/ai-guru/math/teaching', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, grade, language, apiKey: candidateKey, chapterTitle, chapterSummary, chapterTopics, textbookContext, textbookPageJson, teacherReadingMode, teacherSourceMalayalam, teacherExplanationEnglish, teacherExplanationMalayalam }), signal: controller.signal });
          const raw = await r.text();
          let json: any = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { /* preserve raw server error below */ }
          if (r.ok && json?.ok) {
            setData(json); setTimeMs(0); setCue(null); onStatus?.('ready'); succeeded = true; break;
          }
          lastError = String(json?.error || raw || `HTTP ${r.status}`).slice(0, 700);
          // Try the next saved key for auth/quota/provider failures.
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') lastError = '3B1B lesson planning timed out after 18 seconds.';
          else lastError = error instanceof Error ? error.message : String(error);
        } finally {
          window.clearTimeout(timer);
        }
      }
      if (!succeeded) throw new Error(lastError);
    } catch (e) { const detail = e instanceof Error ? e.message : String(e); setError(detail); onStatus?.('error', detail); }
    finally { setBusy(false); }
  }, [apiKey, chapterSummary, chapterTitle, chapterTopics, grade, language, question, teacherReadingMode, teacherSourceMalayalam, teacherExplanationEnglish, teacherExplanationMalayalam, textbookContext, textbookPageJson]);

  useEffect(() => { autoPlayedRef.current = false; void load(); }, [load]);
  useEffect(() => () => { stopSessionRef.current = true; currentAudioRef.current?.pause(); clipsRef.current.forEach(c => { c.audio.pause(); c.audio.src = ''; }); if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const fetchClip = useCallback(async (text: string, speechLanguage: 'english'|'malayalam', speechId: string): Promise<AudioClip> => {
    const languageCode = speechLanguage === 'malayalam' ? 'ml-IN' : 'en-IN';
    const preferred = speechLanguage === 'malayalam' ? ['piper', 'edge', 'google-cloud', 'sarvam'] : ['edge', 'piper', 'google-cloud', 'sarvam'];
    let last = 'TTS failed';
    for (const provider of preferred) {
      if (deadProvidersRef.current.has(provider)) continue;
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 8000);
        let r: Response;
        try {
          r = await fetch('/api/ai-guru/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, text: speechLanguage === 'malayalam' ? normalizeMalayalamSpeech(text) : text, languageCode, speaker: provider === 'edge' ? (speechLanguage === 'malayalam' ? 'ml-IN-SobhanaNeural' : 'en-IN-NeerjaNeural') : provider === 'sarvam' ? 'shubh' : undefined, apiKey: provider === 'sarvam' ? sarvamKeyRef.current : undefined, alignment: true }), signal: controller.signal });
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw new Error(`${provider} TTS timed out after 8 seconds`);
          throw error;
        } finally {
          window.clearTimeout(timer);
        }
        const json = await r.json();
        if (!r.ok || !json?.ok || !json.result?.audioBase64) throw new Error(json?.error || `${provider} HTTP ${r.status}`);
        const mime = json.result.format === 'wav' ? 'audio/wav' : json.result.format === 'webm' ? 'audio/webm' : 'audio/mpeg';
        const audio = new Audio(`data:${mime};base64,${json.result.audioBase64}`);
        await new Promise<void>((resolve, reject) => {
          const done = () => { cleanup(); resolve(); };
          const fail = () => { cleanup(); reject(new Error(`${provider} audio metadata failed`)); };
          const cleanup = () => { audio.onloadedmetadata = null; audio.onerror = null; };
          audio.onloadedmetadata = done; audio.onerror = fail; audio.load();
        });
        const durationMs = Math.max(1, Number(json.result.durationMs) || Math.round((audio.duration || 0) * 1000));
        const words: WordTiming[] = Array.isArray(json.result.words) ? json.result.words.map((w: any) => ({ word: String(w.word), startMs: Number(w.startMs) || 0, endMs: Number(w.endMs) || Number(w.startMs || 0) + 100, source: w.source })) : [];
        return { beatId: speechId, audio, durationMs, words, provider };
      } catch (e) {
        last = e instanceof Error ? e.message : String(e);
        deadProvidersRef.current.add(provider);
        noticeRef.current?.(`${provider} voice unavailable: ${last.slice(0, 160)}`, 'warn');
      }
    }
    // No voice at all. The class must still START: play this clip on captions + visuals at reading pace.
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const durationMs = Math.max(2800, Math.min(30000, words * 420));
    noticeRef.current?.('No voice provider is available — continuing with captions and visuals only.', 'warn');
    return { beatId: speechId, audio: new Audio(), durationMs, words: [], provider: 'silent', silent: true } satisfies AudioClip;
  }, []);


  const updateNarratedFrame = useCallback((beatIndex: number, audio: HTMLAudioElement, clip: AudioClip) => {
    const window = beats[beatIndex];
    const fraction = Math.max(0, Math.min(1, (audio.currentTime * 1000) / Math.max(1, clip.durationMs)));
    const visualTime = window.startMs + (window.endMs - window.startMs) * fraction;
    setTimeMs(visualTime);
    for (const phrase of window.beat.cueWords ?? []) {
      const match = phraseMatches(clip.words, phrase) || phraseMatches(clip.words, language === 'malayalam' ? normalizeMalayalamSpeech(phrase) : phrase);
      if (match && audio.currentTime * 1000 >= match.startMs) {
        const key = `${window.beat.id}:${phrase}`;
        if (!cueFiredRef.current.has(key)) {
          cueFiredRef.current.add(key);
          const text = phrase;
          setCue({ text, language });
          onCue?.(text, language);
        }
      }
    }
  }, [beats, language, onCue]);

  const runNarration = useCallback(async () => {
    if (!data || sessionRunningRef.current) return;
    sessionRunningRef.current = true; stopSessionRef.current = false; cueFiredRef.current.clear(); onStatus?.('playing');
    onSourceCue?.(null);
    try {
      setPlaying(true);
      const queue = speechCues;
      const clips = clipsRef.current;
      for (let i = 0; i < queue.length; i++) {
        if (stopSessionRef.current) break;
        const item = queue[i];
        if (!clips[i]) {
          setVoicePreparing(true);
          setVoiceStatus(`Preparing voice ${i + 1}/${queue.length}…`);
          clips[i] = await fetchClip(item.text, item.language, item.id);
          setVoicePreparing(false);
        }
        const nextPromise = i + 1 < queue.length && !clips[i + 1]
          ? fetchClip(queue[i + 1].text, queue[i + 1].language, queue[i + 1].id)
              .then(next => { clips[i + 1] = next; return next; }).catch(() => undefined)
          : undefined;
        const clip = clips[i];
        const audio = clip.audio; currentAudioRef.current = audio;
        setCue(null);
        onCue?.(item.text, item.language);
        onSourceCue?.(item.beat.sourceCueId || null);
        const w = item.window;
        const phaseStart = w.startMs + ((w.endMs - w.startMs) * item.phase / item.phaseCount);
        const phaseEnd = w.startMs + ((w.endMs - w.startMs) * (item.phase + 1) / item.phaseCount);
        let playedWithVoice = false;
        if (!clip.silent) {
          audio.currentTime = 0;
          try { await audio.play(); playedWithVoice = true; }
          catch (playError) {
            noticeRef.current?.(`Browser blocked audio playback (${playError instanceof Error ? playError.message : String(playError)}) — continuing with captions.`, 'warn');
          }
        }
        if (playedWithVoice) {
          await new Promise<void>(resolve => {
            const tick = () => {
              if (stopSessionRef.current) { audio.pause(); resolve(); return; }
              const fraction = Math.max(0, Math.min(1, (audio.currentTime * 1000) / Math.max(1, clip.durationMs)));
              setTimeMs(phaseStart + (phaseEnd - phaseStart) * fraction);
              if (!audio.ended) rafRef.current = requestAnimationFrame(tick); else resolve();
            };
            tick();
            audio.onended = () => resolve();
          });
        } else {
          // Silent pacing: the class keeps moving at reading speed so it never looks "not started".
          setVoiceStatus('No voice available — playing with captions only');
          const started = performance.now();
          await new Promise<void>(resolve => {
            const tick = () => {
              if (stopSessionRef.current) { resolve(); return; }
              const fraction = Math.max(0, Math.min(1, (performance.now() - started) / Math.max(1, clip.durationMs)));
              setTimeMs(phaseStart + (phaseEnd - phaseStart) * fraction);
              if (fraction < 1) rafRef.current = requestAnimationFrame(tick); else resolve();
            };
            tick();
          });
        }
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        await nextPromise;
      }
      if (!stopSessionRef.current) {
        setVoiceReady(queue.length > 0 && clips.length >= queue.length && clips.slice(0, queue.length).every(Boolean));
        setVoiceStatus(clips.slice(0, queue.length).some(c => c?.silent) ? 'Class complete (some parts had no voice)' : 'Voice sync complete');
        setTimeMs(total); setCue(null); onSourceCue?.(null); onStatus?.('completed'); onComplete?.();
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      onStatus?.('error', `Class playback failed: ${detail}`);
      setVoiceStatus(`Playback failed: ${detail}`);
    } finally {
      setVoicePreparing(false); currentAudioRef.current = null; sessionRunningRef.current = false; setPlaying(false);
    }
  }, [data, fetchClip, language, onComplete, onCue, onSourceCue, onStatus, speechCues, teacherReadingMode, total]);

  useEffect(() => {
    if (playing && !sessionRunningRef.current && !voicePreparing) void runNarration();
  }, [playing, runNarration, voicePreparing]);

  useEffect(() => {
    if (!autoPlay || autoPlayedRef.current || !data || busy || voicePreparing || playing) return;
    autoPlayedRef.current = true;
    void runNarration();
  }, [autoPlay, busy, data, playing, runNarration, voicePreparing]);

  const manualPlay = useCallback(() => {
    if (!scene) return;
    setPlaying(v => !v);
  }, [scene]);

  useEffect(() => {
    if (!playing || voiceReady || sessionRunningRef.current || !scene) return;
    const start = performance.now() - timeMs;
    const tick = (now: number) => {
      const next = Math.min(total, now - start); setTimeMs(next);
      if (next < total) rafRef.current = requestAnimationFrame(tick); else setPlaying(false);
    };
    // Manual mode is only used until narrated voice is prepared.
    if (!voicePreparing) rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, scene, timeMs, total, voicePreparing, voiceReady]);

  const seek = (value: number) => { currentAudioRef.current?.pause(); stopSessionRef.current = true; sessionRunningRef.current = false; setTimeMs(Math.max(0, Math.min(total, value))); setPlaying(false); };
  const reset = () => { seek(0); setCue(null); cueFiredRef.current.clear(); };

  return <div className="absolute inset-0 z-30 flex flex-col bg-[#07101a]">
    <div className="flex items-center gap-3 border-b border-cyan-300/10 bg-[#091622] px-3 py-2">
      <div className="min-w-0 flex-1"><div className="text-[9px] uppercase tracking-[.22em] text-cyan-300/60">AI Guru · 3B1B Teaching Engine</div><div className="truncate text-sm font-semibold">{data?.lesson.title || question}</div></div>
      {data && <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] text-cyan-200">{data.lesson.domain}</span>}{data && <span className={`rounded-full border px-2 py-1 text-[10px] ${data.lesson.quality?.passed ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-200'}`}>{data.lesson.quality?.passed ? 'QA verified' : 'QA review'}</span>}
      <button onClick={() => void load()} disabled={busy} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/75 disabled:opacity-40">↻ Regenerate</button>
      <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/75">× Close</button>
    </div>
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {scene && snapshot ? <svg viewBox="0 0 1000 700" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <g transform={`translate(${500 - snapshot.camera.x * snapshot.camera.scale} ${350 - snapshot.camera.y * snapshot.camera.scale}) scale(${snapshot.camera.scale})`}>
          {nodes.map(n => <Node key={n.id} n={n} active={snapshot.activeEventIds.some(id => scene.events.find(e => e.id === id)?.targetId === n.id)} p={palette(scene)} />)}
        </g>
      </svg> : <div className="flex h-full items-center justify-center p-8 text-center text-sm text-white/45">{busy ? 'AI Guru is building the lesson with Chapter → Lesson → Beat Video-DNA…' : error || 'No lesson loaded.'}</div>}
      {cue && <div className="absolute bottom-4 left-1/2 w-[min(900px,92%)] -translate-x-1/2 rounded-2xl border border-cyan-300/15 bg-black/75 px-5 py-3 text-center text-base text-white shadow-2xl" style={{ fontFamily: language === 'malayalam' ? 'Chilanka, Noto Sans Malayalam, Nirmala UI, sans-serif' : 'Inter, sans-serif' }}>{cue.text}</div>}
    </div>
    <div className="border-t border-white/10 bg-[#071321] px-3 py-2">
      <input aria-label="3B1B lesson timeline" type="range" min={0} max={Math.max(1, total)} value={timeMs} onChange={e => seek(Number(e.target.value))} className="w-full accent-cyan-300" />
      <div className="flex items-center gap-2 text-[10px] text-white/45">
        <button onClick={reset} className="rounded-lg bg-white/10 px-3 py-1.5">↺</button>
        <button onClick={manualPlay} disabled={!scene || busy || voicePreparing} className="rounded-lg bg-cyan-300 px-4 py-1.5 font-semibold text-black disabled:opacity-30">{playing ? 'Ⅱ Pause' : '▶ Play'}</button>
        <span>{Math.round(timeMs / 1000)}s / {Math.round(total / 1000)}s</span>
        <span className={`ml-auto ${voiceReady ? 'text-emerald-300/80' : 'text-amber-300/70'}`}>{voiceStatus}</span>
      </div>
      {data?.lesson.segments?.length ? <div className="mt-1 text-[9px] text-white/35">{data.lesson.segments.length} teaching segments · {data.lesson.segments.reduce((n, s) => n + s.beats.length, 0)} beats · visual timing follows measured TTS playback when voice sync is ready</div> : null}
      {data?.warnings?.length ? <div className="mt-1 text-[9px] text-amber-300/70">{data.warnings.join(' · ')}</div> : null}
    </div>
  </div>;
}
