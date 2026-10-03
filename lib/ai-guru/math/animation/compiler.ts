import type { MathVisualNode, MathVisualEvent, UniversalMathScene } from '../universal/types';
import type { AIGuruTeachingLesson, AnimationIntent, TeachingBeat } from '../teaching/types';
import type { AnimationCompiler, AnimationCompilerOptions, AnimationSceneGraph, CompiledAnimationEvent, CompiledTeachingLesson } from './types';

function nodeForIntent(intent: AnimationIntent): MathVisualNode | undefined {
  if (intent.type === 'create' && intent.node) return { ...intent.node, id: intent.node.id ?? intent.objectId };
  return undefined;
}

function eventKind(intent: AnimationIntent): MathVisualEvent['kind'] {
  switch (intent.type) {
    case 'transform': case 'morph': return 'transform';
    case 'highlight': case 'indicate': return 'highlight';
    case 'erase': return 'erase';
    case 'move': return 'move';
    case 'pause': return 'pause';
    case 'camera': return 'camera';
    default: return 'draw';
  }
}

function durationFor(intent: AnimationIntent, transitionMs: number): number {
  return intent.type === 'pause' ? Math.max(0, intent.durationMs) : transitionMs;
}

function buildWordCues(text: string, words: string[] | undefined, atMs: number, durationMs: number) {
  const cueWords = (words ?? []).filter(Boolean);
  if (!cueWords.length) return undefined;
  const step = durationMs / Math.max(1, cueWords.length);
  return cueWords.map((word, i) => ({ word, atMs: Math.round(atMs + i * step) }));
}

function pacingDefaults(lesson: AIGuruTeachingLesson, options: AnimationCompilerOptions) {
  const pacing = lesson.visualGrammar.pacing ?? 'medium';
  const base = pacing === 'slow' ? { beat: 1800, transition: 800, pause: 500 } : pacing === 'fast' ? { beat: 1000, transition: 450, pause: 250 } : { beat: 1400, transition: 650, pause: 350 };
  return {
    defaultBeatDurationMs: options.defaultBeatDurationMs ?? base.beat,
    transitionMs: options.transitionMs ?? base.transition,
    pauseMs: options.pauseMs ?? base.pause,
  };
}

function narrativeBeat(id: string, narration: string, _x: number, _y: number, _accent: string): TeachingBeat {
  // Narrative belongs to the teacher's voice/caption layer, not the mathematical
  // canvas. Rendering paragraphs as SVG text was the source of the overlapping
  // wall-of-text board seen in General Class. Keep a timed pause event so the
  // narration remains synchronized without polluting the visual scene.
  return {
    id,
    narration,
    cueWords: narration.split(/\s+/).filter(Boolean).slice(0, 5),
    durationMs: Math.max(1000, Math.min(3600, 700 + narration.length * 28)),
    visualIntent: 'pause',
    targetObjects: [],
    actions: [{ type: 'pause', durationMs: Math.max(250, Math.min(900, 350 + narration.length * 3)) }],
  };
}

function expandNarrative(lesson: AIGuruTeachingLesson): TeachingBeat[] {
  const out: TeachingBeat[] = [];
  if (lesson.openingQuestion.trim()) out.push(narrativeBeat('narrative:opening', lesson.openingQuestion.trim(), 60, 55, '#67e8f9'));
  if (lesson.whyItMatters.trim()) out.push(narrativeBeat('narrative:why', lesson.whyItMatters.trim(), 60, 135, '#a5b4fc'));
  for (const prerequisite of lesson.prerequisites.slice(0, lesson.difficulty?.maxPrerequisites ?? 5)) {
    if (!prerequisite.title.trim()) continue;
    out.push(narrativeBeat(`narrative:prerequisite:${prerequisite.id}`, `Before we continue, we need ${prerequisite.title}. ${prerequisite.reason}`.trim(), 60, 215, '#c4b5fd'));
  }
  out.push(narrativeBeat('narrative:running-example', `Our running example: ${lesson.runningExample.description}`, 60, 295, '#86efac'));
  for (const segment of [...lesson.segments].sort((a, b) => a.order - b.order)) {
    if (segment.intuition.explanation.trim()) out.push(narrativeBeat(`narrative:${segment.id}:intuition`, `Intuition — ${segment.intuition.explanation.trim()}`, 60, 375, '#7dd3fc'));
    if (segment.mathematics.explanation.trim()) out.push(narrativeBeat(`narrative:${segment.id}:mathematics`, `Mathematics — ${segment.mathematics.explanation.trim()}`, 60, 455, '#fbbf24'));
    out.push(...segment.beats);
  }
  if (lesson.finalInsight.trim()) out.push(narrativeBeat('narrative:final-insight', `Key insight: ${lesson.finalInsight.trim()}`, 60, 535, '#fde68a'));
  return out;
}

function compileBeat(beat: TeachingBeat, clock: number, options: ReturnType<typeof pacingDefaults>, nodes: Map<string, MathVisualNode>) {
  const beatDuration = Math.max(options.defaultBeatDurationMs, beat.durationMs ?? options.defaultBeatDurationMs);
  const actions = beat.actions.length ? beat.actions : [{ type: 'pause', durationMs: options.pauseMs } satisfies AnimationIntent];
  const per = Math.max(1, Math.floor(beatDuration / actions.length));
  const events: CompiledAnimationEvent[] = [];
  let local = clock;
  actions.forEach((intent, index) => {
    const node = nodeForIntent(intent); if (node) nodes.set(node.id, node);
    const targetId = intent.type === 'transform' || intent.type === 'morph' ? intent.toObjectId : 'objectId' in intent ? intent.objectId : intent.type === 'camera' ? intent.targetId : undefined;
    const durationMs = durationFor(intent, options.transitionMs);
    const event: CompiledAnimationEvent = {
      id: `beat:${beat.id}:${index}`, atMs: local, durationMs, kind: eventKind(intent), targetId,
      textCue: index === 0 ? beat.narration : undefined, sourceBeatId: beat.id, semanticAction: intent.type,
      fromObjectId: intent.type === 'transform' || intent.type === 'morph' ? intent.fromObjectId : undefined,
      toObjectId: intent.type === 'transform' || intent.type === 'morph' ? intent.toObjectId : undefined,
      retainFrom: intent.type === 'transform' ? intent.retainFrom : undefined,
      fromX: intent.type === 'move' ? undefined : undefined,
      fromY: intent.type === 'move' ? undefined : undefined,
      toX: intent.type === 'move' ? intent.toX : undefined,
      toY: intent.type === 'move' ? intent.toY : undefined,
      camera: intent.type === 'camera' ? { action: intent.action, x: intent.x, y: intent.y, scale: intent.scale } : undefined,
      cueWords: index === 0 ? buildWordCues(beat.narration, beat.cueWords, local, durationMs) : undefined,
    };
    if (intent.type === 'move') {
      const source = nodes.get(intent.objectId);
      event.fromX = Number(source?.x ?? 0); event.fromY = Number(source?.y ?? 0);
    }
    events.push(event);
    local += per;
  });
  return { events, endMs: Math.max(clock + beatDuration, local) };
}

function validateReferences(lesson: AIGuruTeachingLesson, nodes: Map<string, MathVisualNode>) {
  const warnings: string[] = [];
  const known = new Set(nodes.keys());
  for (const segment of lesson.segments) for (const beat of segment.beats) for (const intent of beat.actions) {
    const ids = intent.type === 'transform' || intent.type === 'morph'
      ? [intent.fromObjectId, intent.toObjectId]
      : intent.type === 'camera' ? (intent.targetId ? [intent.targetId] : [])
      : intent.type === 'pause' ? [] : [intent.objectId];
    for (const id of ids) if (!known.has(id)) warnings.push(`Unknown animation object "${id}" referenced by ${beat.id}.`);
  }
  return [...new Set(warnings)];
}

export const animationCompiler: AnimationCompiler = {
  compile(lesson, options = {}) {
    const defaults = pacingDefaults(lesson, options);
    const nodes = new Map<string, MathVisualNode>();
    const persistentIds = new Set(lesson.runningExample.persistentObjectIds);
    const events: CompiledAnimationEvent[] = [];
    const authoredBeats = [...lesson.segments].sort((a, b) => a.order - b.order).flatMap(s => s.beats);
    const beats = expandNarrative(lesson);
    const warnings: string[] = [];
    let clock = 0;
    for (const beat of beats) {
      const compiled = compileBeat(beat, clock, defaults, nodes);
      events.push(...compiled.events);
      const isAuthored = authoredBeats.includes(beat);
      const cameraMode = lesson.visualGrammar.camera ?? 'static';
      const focusTarget = beat.targetObjects.find(id => nodes.has(id));
      if (isAuthored && focusTarget && cameraMode !== 'static') {
        events.push({
          id: `camera:${beat.id}`, atMs: compiled.events[0]?.atMs ?? clock, durationMs: defaults.transitionMs, kind: 'camera', targetId: focusTarget,
          camera: { action: cameraMode === 'cinematic' ? 'zoom' : 'focus', scale: cameraMode === 'cinematic' ? 1.25 : 1.4 }, sourceBeatId: beat.id, semanticAction: 'camera',
        });
      }
      clock = compiled.endMs + defaults.pauseMs;
    }
    for (const id of [...nodes.keys()]) if (authoredBeats.some(b => b.targetObjects.includes(id)) || lesson.runningExample.persistentObjectIds.includes(id)) persistentIds.add(id);
    warnings.push(...validateReferences(lesson, nodes));
    const sceneGraph: AnimationSceneGraph = { schemaVersion: '1.1', objects: nodes, persistentIds };
    const verified = lesson.quality?.passed === true && lesson.quality.checks['math-correctness'] === true;
    const scene: UniversalMathScene = {
      schemaVersion: '1.0', id: options.id ?? `3b1b:${lesson.id}`, domain: lesson.domain, gradeBand: lesson.gradeBand, title: lesson.title,
      expression: lesson.expression ?? lesson.runningExample.expression ?? lesson.learningGoal, verified: verified && warnings.length === 0,
      verification: { errors: [...(lesson.quality?.issues ?? []), ...warnings] },
      nodes: [...nodes.values()], events,
      narrationCues: beats.map(beat => ({ id: `cue:${beat.id}`, atMs: events.find(e => e.sourceBeatId === beat.id)?.atMs ?? 0, language: options.teachingLanguage ?? 'english', text: beat.narration, targetId: beat.targetObjects[0] })),
      teachingLanguage: options.teachingLanguage ?? 'english',
      visualStyle: lesson.visualGrammar.archetype ? { id: lesson.visualGrammar.archetype, name: lesson.visualGrammar.archetype, score: 1, reasons: ['Selected by the 3B1B hierarchical Video-DNA teaching strategy.'], alternatives: [], referenceIds: lesson.visualGrammar.dnaIds } : undefined,
    };
    return { scene, beats: authoredBeats, events, sceneGraph, warnings };
  },
};

export function compileAIGuruTeachingLesson(lesson: AIGuruTeachingLesson, options?: AnimationCompilerOptions): CompiledTeachingLesson {
  return animationCompiler.compile(lesson, options);
}
