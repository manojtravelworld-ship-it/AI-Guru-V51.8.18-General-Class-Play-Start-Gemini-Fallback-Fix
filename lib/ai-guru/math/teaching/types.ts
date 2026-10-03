/**
 * Extended Teaching Types for Teacher-Reading Mode (V51.8.14)
 * ----------------------------------------------------------
 * Backwards-compatible additions on top of the existing 3B1B beat model.
 * Import this file (or merge the new fields) in place of the previous types.ts.
 */

import type { MathDomain, MathVisualNode, UniversalMathScene } from '../universal/types';

export type GradeBand = UniversalMathScene['gradeBand'];

export type TeachingVisualIntent =
  | 'create'
  | 'draw'
  | 'transform'
  | 'move'
  | 'morph'
  | 'highlight'
  | 'compare'
  | 'derive'
  | 'graph'
  | 'geometry'
  | 'camera'
  | 'pause';

export interface PrerequisiteConcept {
  id: string;
  title: string;
  reason: string;
  required: boolean;
}

export interface RunningExample {
  id: string;
  description: string;
  expression?: string;
  persistentObjectIds: string[];
}

export interface IntuitionSection {
  explanation: string;
  visualMetaphor?: string;
  concreteExample?: string;
}

export interface MathematicsSection {
  explanation: string;
  expressions?: string[];
  verified?: boolean;
}

export interface LessonVisualGrammar {
  archetype?: string;
  dnaIds?: string[];
  constructionPattern?: string;
  motifs?: string[];
  pacing?: 'slow' | 'medium' | 'fast';
  camera?: 'static' | 'focus' | 'cinematic';
  beatMix?: { build?: number; transform?: number; move?: number; remove?: number };
  qaRules?: string[];
}

export interface LessonQuality {
  passed: boolean;
  score?: number;
  issues: string[];
  checks: Record<string, boolean>;
}

export type AnimationIntent =
  | { type: 'create'; objectId: string; node?: MathVisualNode }
  | { type: 'draw'; objectId: string }
  | { type: 'move'; objectId: string; toX: number; toY: number }
  | { type: 'transform'; fromObjectId: string; toObjectId: string; retainFrom?: boolean }
  | { type: 'morph'; fromObjectId: string; toObjectId: string }
  | { type: 'highlight'; objectId: string }
  | { type: 'indicate'; objectId: string }
  | { type: 'erase'; objectId: string }
  | { type: 'camera'; action: 'zoom' | 'pan' | 'focus'; targetId?: string; scale?: number; x?: number; y?: number }
  | { type: 'pause'; durationMs: number };

/** NEW: bilingual read / translate / explain layers that share one visual beat */
export interface BilingualSpeech {
  en: string;
  ml: string;
}

/**
 * A single teaching beat now optionally carries:
 *  - sourceCueId   → links back to TextbookCursor
 *  - read          → exact textbook sentence (English + Malayalam)
 *  - explain       → teacher explanation (why / known / unknown)
 *  - narration     → kept for backward compatibility (falls back to explain.en)
 */
export interface TeachingBeat {
  id: string;
  /** Primary spoken line (backward-compatible). Prefer explain.en when present. */
  narration: string;
  cueWords?: string[];
  durationMs?: number;
  visualIntent: TeachingVisualIntent;
  targetObjects: string[];
  actions: AnimationIntent[];
  dna?: {
    dnaId: string;
    archetype: string;
    constructionStep?: string;
    motif?: string;
  };

  // ── Teacher-Reading extensions (V51.8.14) ──────────────────────────
  /** Stable ID of the textbook sentence this beat is teaching */
  sourceCueId?: string;
  /** Exact reading of the textbook sentence */
  read?: BilingualSpeech;
  /** Teacher explanation (why this sentence matters, what is known/unknown) */
  explain?: BilingualSpeech;
  /** Optional micro-check question the teacher asks the student */
  checkQuestion?: BilingualSpeech;
}

export interface TeachingSegment {
  id: string;
  title: string;
  order: number;
  intuition: IntuitionSection;
  mathematics: MathematicsSection;
  beats: TeachingBeat[];
  narration?: string;
  estimatedDurationMs?: number;
}

export interface TeachingDifficultyProfile {
  tier: 'foundation' | 'core' | 'advanced' | 'senior';
  minSegments: number;
  maxSegments: number;
  minBeatsPerSegment: number;
  maxBeatsPerSegment: number;
  maxNarrationChars: number;
  maxPrerequisites: number;
}

export interface AIGuruTeachingLesson {
  schemaVersion: '2.0' | '2.1';
  id: string;
  title: string;
  grade: number;
  gradeBand: GradeBand;
  domain: MathDomain;
  openingQuestion: string;
  whyItMatters: string;
  /** Spoken bilingual teacher framing for the topic introduction. */
  openingTeacher?: BilingualSpeech;
  whyItMattersTeacher?: BilingualSpeech;
  learningGoal: string;
  prerequisites: PrerequisiteConcept[];
  runningExample: RunningExample;
  segments: TeachingSegment[];
  finalInsight: string;
  visualGrammar: LessonVisualGrammar;
  difficulty: TeachingDifficultyProfile;
  expression?: string;
  quality?: LessonQuality;
  /** Optional full textbook page that this lesson is teaching from */
  textbookPage?: import('../../lesson/textbook-cursor').TextbookPage;
}
