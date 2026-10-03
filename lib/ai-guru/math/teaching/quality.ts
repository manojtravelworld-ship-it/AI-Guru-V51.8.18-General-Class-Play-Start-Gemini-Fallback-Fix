import { HybridMathVerifier } from '../verifier';
import { MathJsMathstepsVerifier } from '../mathjs-mathsteps';
import type { AIGuruTeachingLesson, LessonQuality, TeachingDifficultyProfile } from './types';
import type { MathVisualNode } from '../universal/types';

const verifier = new HybridMathVerifier(new MathJsMathstepsVerifier());

export function difficultyProfile(grade: number): TeachingDifficultyProfile {
  if (grade <= 5) return { tier: 'foundation', minSegments: 1, maxSegments: 4, minBeatsPerSegment: 2, maxBeatsPerSegment: 4, maxNarrationChars: 150, maxPrerequisites: 2 };
  if (grade <= 8) return { tier: 'core', minSegments: 2, maxSegments: 5, minBeatsPerSegment: 2, maxBeatsPerSegment: 5, maxNarrationChars: 190, maxPrerequisites: 3 };
  if (grade <= 10) return { tier: 'advanced', minSegments: 2, maxSegments: 6, minBeatsPerSegment: 2, maxBeatsPerSegment: 6, maxNarrationChars: 230, maxPrerequisites: 4 };
  return { tier: 'senior', minSegments: 2, maxSegments: 7, minBeatsPerSegment: 2, maxBeatsPerSegment: 6, maxNarrationChars: 280, maxPrerequisites: 5 };
}

function nodeBox(n: MathVisualNode) {
  const x = Number(n.x ?? 0), y = Number(n.y ?? 0);
  if (n.kind === 'line' || n.kind === 'arrow') {
    const sx = Number(n.startX ?? x), sy = Number(n.startY ?? y), ex = Number(n.endX ?? x), ey = Number(n.endY ?? y);
    return { x: Math.min(sx, ex), y: Math.min(sy, ey), w: Math.max(1, Math.abs(ex - sx)), h: Math.max(1, Math.abs(ey - sy)) };
  }
  return { x, y, w: Math.max(1, Number(n.width ?? (n.kind === 'text' || n.kind === 'latex' ? Math.max(40, String(n.content ?? n.latex ?? '').length * 18) : 40))), h: Math.max(1, Number(n.height ?? (n.kind === 'text' || n.kind === 'latex' ? Number(n.style?.fontSize ?? 36) * 1.4 : 40))) };
}

function overlap(a: ReturnType<typeof nodeBox>, b: ReturnType<typeof nodeBox>) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function actionClass(type: string) {
  if (['create', 'draw'].includes(type)) return 'build';
  if (['transform', 'morph'].includes(type)) return 'transform';
  if (type === 'move') return 'move';
  if (['erase'].includes(type)) return 'remove';
  return null;
}

export async function evaluateTeachingLesson(lesson: AIGuruTeachingLesson): Promise<LessonQuality> {
  const profile = lesson.difficulty ?? difficultyProfile(lesson.grade);
  const issues: string[] = [];
  const checks: Record<string, boolean> = {};

  const expressions = [lesson.expression, lesson.runningExample.expression, ...lesson.segments.flatMap(s => s.mathematics.expressions ?? [])]
    .map(x => String(x ?? '').trim()).filter(Boolean);
  const uniqueExpressions = [...new Set(expressions)];
  const verificationResults = await Promise.all(uniqueExpressions.map(async expression => ({ expression, result: await verifier.verify(expression) })));
  checks['math-correctness'] = uniqueExpressions.length > 0 && verificationResults.every(x => x.result.valid);
  if (!checks['math-correctness']) issues.push(uniqueExpressions.length ? `Math verification failed for: ${verificationResults.filter(x => !x.result.valid).map(x => x.expression).join(' | ')}` : 'No mathematical expression was supplied for verification.');

  checks['difficulty-adaptation'] = lesson.segments.length >= profile.minSegments && lesson.segments.length <= profile.maxSegments && lesson.prerequisites.length <= profile.maxPrerequisites && lesson.segments.every(s => s.beats.length >= profile.minBeatsPerSegment && s.beats.length <= profile.maxBeatsPerSegment && s.beats.every(b => b.narration.length <= profile.maxNarrationChars));
  if (!checks['difficulty-adaptation']) issues.push(`Difficulty profile ${profile.tier} violated: segments ${lesson.segments.length}, prerequisites ${lesson.prerequisites.length}, narration/beat limits or beat counts exceeded.`);

  const created = new Set<string>(lesson.runningExample.persistentObjectIds);
  const missing: string[] = [];
  for (const segment of [...lesson.segments].sort((a, b) => a.order - b.order)) for (const beat of segment.beats) {
    for (const action of beat.actions) {
      if (action.type === 'create') { created.add(action.objectId); continue; }
      const ids = action.type === 'transform' || action.type === 'morph' ? [action.fromObjectId, action.toObjectId] : action.type === 'camera' ? (action.targetId ? [action.targetId] : []) : action.type === 'pause' ? [] : [action.objectId];
      for (const id of ids) if (!created.has(id)) missing.push(`${beat.id}:${id}`);
    }
  }
  checks['object-id-integrity'] = missing.length === 0;
  if (missing.length) issues.push(`Animation actions reference unknown objects: ${missing.slice(0, 8).join(', ')}`);

  const nodes = [...lesson.segments.flatMap(s => s.beats.flatMap(b => b.actions.flatMap(a => a.type === 'create' && a.node ? [a.node] : [])))];
  const unsafe = nodes.filter(n => { const b = nodeBox(n); return b.x < 24 || b.y < 24 || b.x + b.w > 976 || b.y + b.h > 676; });
  checks['safe-frame'] = unsafe.length === 0;
  if (unsafe.length) issues.push(`${unsafe.length} created visual node(s) leave the 24px safe frame.`);
  const geometryInvalid = nodes.filter(n => {
    if (n.kind === 'shape') return !(Number(n.width ?? 0) > 0 && Number(n.height ?? 0) > 0) || !['rectangle', 'circle', 'triangle'].includes(String(n.shape));
    if (n.kind === 'line' || n.kind === 'arrow') return ![n.startX, n.startY, n.endX, n.endY].every(Number.isFinite);
    if (n.kind === 'graph') return !(n.graph?.x?.length && n.graph.x.length === n.graph.y.length && n.graph.x.every(Number.isFinite) && n.graph.y.every(Number.isFinite));
    return false;
  });
  checks['geometry-integrity'] = geometryInvalid.length === 0;
  if (geometryInvalid.length) issues.push(`${geometryInvalid.length} geometry/graph node(s) have invalid dimensions, coordinates or graph arrays.`);
  const unreadable = nodes.filter(n => ['text', 'latex'].includes(n.kind) && Number(n.style?.fontSize ?? 36) < 22);
  checks['readable-text'] = unreadable.length === 0;
  if (unreadable.length) issues.push(`${unreadable.length} text/LaTeX node(s) use a font size below 22px.`);
  const textNodes = nodes.filter(n => ['text', 'latex'].includes(n.kind));
  const longVisualText = nodes.filter(n => n.kind === 'text' && String(n.content ?? '').trim().length > 80);
  checks['concise-visual-labels'] = longVisualText.length === 0;
  if (longVisualText.length) issues.push(`${longVisualText.length} visual text node(s) are too long; detailed teaching prose belongs in narration/captions, not the whiteboard.`);
  let textOverlap = 0;
  for (let i = 0; i < textNodes.length; i++) for (let j = i + 1; j < textNodes.length; j++) if (overlap(nodeBox(textNodes[i]), nodeBox(textNodes[j]))) textOverlap++;
  checks['text-overlap'] = textOverlap === 0;
  if (textOverlap) issues.push(`${textOverlap} text/LaTeX node pair(s) overlap.`);

  const mix = lesson.visualGrammar.beatMix;
  if (mix) {
    const counts: Record<string, number> = { build: 0, transform: 0, move: 0, remove: 0 };
    let total = 0;
    for (const segment of lesson.segments) for (const beat of segment.beats) for (const action of beat.actions) { const c = actionClass(action.type); if (c) { counts[c]++; total++; } }
    const mismatches = Object.entries(mix).filter(([k, expected]) => Number(expected) > 0 && total > 0 && Math.abs((counts[k] / total) - Number(expected)) > 0.38);
    checks['beat-mix'] = mismatches.length === 0;
    if (mismatches.length) issues.push(`Beat-mix drift: ${mismatches.map(([k, v]) => `${k} target=${Number(v).toFixed(2)} actual=${(counts[k] / total).toFixed(2)}`).join(', ')}`);
  } else checks['beat-mix'] = true;

  checks['narrative-contract'] = Boolean(lesson.openingQuestion.trim() && lesson.whyItMatters.trim() && lesson.runningExample.description.trim() && lesson.finalInsight.trim());
  if (!checks['narrative-contract']) issues.push('Opening question, why-it-matters, running example and final insight must all be present.');

  // Teacher-Reading contract: when a textbook page is attached, every readable
  // textbook sentence must have one teaching beat with an exact sourceCueId,
  // bilingual reading, and bilingual teacher explanation. This prevents the
  // planner from silently summarising a page instead of reading it like a teacher.
  if (lesson.textbookPage) {
    const readable = lesson.textbookPage.paragraphs.flatMap(p => p.sentences).filter(s => s.readable);
    const beats = lesson.segments.flatMap(s => s.beats);
    const beatByCue = new Map<string, typeof beats[number]>();
    for (const beat of beats) if (beat.sourceCueId) beatByCue.set(beat.sourceCueId, beat);
    const missingCues = readable.filter(s => !beatByCue.has(s.id)).map(s => s.id);
    const invalidCues = beats.filter(b => b.sourceCueId && !readable.some(s => s.id === b.sourceCueId)).map(b => b.sourceCueId as string);
    const incomplete = beats.filter(b => b.sourceCueId && (!b.read?.en?.trim() || !b.read?.ml?.trim() || !b.explain?.en?.trim() || !b.explain?.ml?.trim())).map(b => b.id);
    const changedSourceText = beats.filter(b => {
      if (!b.sourceCueId || !b.read?.en?.trim()) return false;
      const source = readable.find(s => s.id === b.sourceCueId);
      if (!source) return false;
      const norm = (v: string) => v.replace(/\s+/g, ' ').trim();
      return norm(source.text) !== norm(b.read.en);
    }).map(b => b.id);
    const introComplete = Boolean(lesson.openingTeacher?.en?.trim() && lesson.openingTeacher?.ml?.trim() && lesson.whyItMattersTeacher?.en?.trim() && lesson.whyItMattersTeacher?.ml?.trim());
    checks['teacher-reading-coverage'] = missingCues.length === 0 && invalidCues.length === 0 && incomplete.length === 0 && changedSourceText.length === 0 && introComplete;
    if (missingCues.length) issues.push(`Teacher-Reading is missing textbook cue(s): ${missingCues.slice(0, 8).join(', ')}`);
    if (invalidCues.length) issues.push(`Teacher-Reading contains invalid source cue(s): ${invalidCues.slice(0, 8).join(', ')}`);
    if (incomplete.length) issues.push(`Teacher-Reading beat(s) lack bilingual read/explain fields: ${incomplete.slice(0, 8).join(', ')}`);
    if (changedSourceText.length) issues.push(`Teacher-Reading altered the textbook sentence instead of reading it verbatim: ${changedSourceText.slice(0, 8).join(', ')}`);
    if (!introComplete) issues.push('Teacher-Reading is missing bilingual topic introduction (openingTeacher / whyItMattersTeacher).');
  } else {
    checks['teacher-reading-coverage'] = true;
  }
  checks['prerequisites-integrated'] = true; // The compiler materializes prerequisite narration beats before authored segments.

  const qaRules = lesson.visualGrammar.qaRules ?? [];
  const ruleText = qaRules.join(' ').toLowerCase();
  let qaRuleFailures = 0;
  if (/text.*overlap.*figure|overlap.*figure/.test(ruleText)) {
    const spatialNodes = nodes.filter(n => ['shape', 'line', 'arrow', 'graph', 'highlight', 'transform'].includes(n.kind));
    if (textNodes.some(t => spatialNodes.some(v => overlap(nodeBox(t), nodeBox(v))))) qaRuleFailures++;
  }
  if (/safe frame|safe-frame|bounded/.test(ruleText) && !checks['safe-frame']) qaRuleFailures++;
  if (/pause.*insight|insight.*pause|deliberate pause/.test(ruleText)) {
    const last = lesson.segments.slice().sort((a, b) => a.order - b.order).at(-1);
    if (!last?.beats.some(b => b.actions.some(a => a.type === 'pause'))) qaRuleFailures++;
  }
  if (/highlight.*narration|critical.*highlight/.test(ruleText)) {
    const mentions = lesson.segments.flatMap(s => s.beats).filter(b => /highlight|notice|important|focus|look at/i.test(b.narration));
    if (mentions.length && !mentions.some(b => b.actions.some(a => a.type === 'highlight' || a.type === 'indicate'))) qaRuleFailures++;
  }
  checks['video-dna-qa-rules'] = qaRuleFailures === 0;
  if (qaRuleFailures) issues.push(`${qaRuleFailures} selected Video-DNA QA rule(s) failed.`);

  const passed = Object.values(checks).every(Boolean);
  return { passed, score: Object.values(checks).filter(Boolean).length / Math.max(1, Object.keys(checks).length), issues, checks };
}
