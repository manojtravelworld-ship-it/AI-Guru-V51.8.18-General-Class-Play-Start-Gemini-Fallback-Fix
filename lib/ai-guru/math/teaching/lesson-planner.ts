import 'server-only';

import type { MathDomain } from '../universal/types';
import { selectChapterVideoDna, selectLessonVideoDna } from '../rag/video-dna-selector';
import type { AIGuruTeachingLesson, AnimationIntent, TeachingBeat } from './types';
import { difficultyProfile } from './quality';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export type PlannerInput = {
  question: string;
  grade: number;
  domain: MathDomain;
  language?: 'english' | 'malayalam';
  expression?: string;
  learningGoal?: string;
  byokKey?: string;
  chapterTitle?: string;
  chapterSummary?: string;
  chapterTopics?: string[];
  /** Full textbook page text or structured cursor JSON (preferred) */
  textbookContext?: string;
  /** Optional pre-built TextbookPage JSON for precise cue IDs */
  textbookPageJson?: string;
  repairInstructions?: string;
  /** When true, planner emits sourceCueId + read/explain bilingual layers */
  teacherReadingMode?: boolean;
  /** Optional pre-generated bilingual material used only by the emergency local fallback. */
  teacherSourceMalayalam?: string;
  teacherExplanationEnglish?: string;
  teacherExplanationMalayalam?: string;
};

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Gemini did not return a JSON 3B1B teaching lesson.');
  return JSON.parse(fenced.slice(start, end + 1));
}

function gradeBand(grade: number): AIGuruTeachingLesson['gradeBand'] {
  return grade <= 5 ? '1-5' : grade <= 8 ? '6-8' : grade <= 10 ? '9-10' : '11-12';
}

function sanitizeAction(action: any): AnimationIntent | null {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return null;
  const type = action.type;
  if (type === 'create') {
    if (!action.objectId || !action.node) return null;
    return { type, objectId: String(action.objectId), node: { ...action.node, id: action.node.id ?? String(action.objectId) } };
  }
  if (type === 'draw' || type === 'highlight' || type === 'indicate' || type === 'erase') {
    if (!action.objectId) return null;
    return { type, objectId: String(action.objectId) } as AnimationIntent;
  }
  if (type === 'move') {
    if (!action.objectId || !Number.isFinite(action.toX) || !Number.isFinite(action.toY)) return null;
    return { type, objectId: String(action.objectId), toX: Number(action.toX), toY: Number(action.toY) };
  }
  if (type === 'transform' || type === 'morph') {
    if (!action.fromObjectId || !action.toObjectId) return null;
    return { type, fromObjectId: String(action.fromObjectId), toObjectId: String(action.toObjectId), ...(action.retainFrom !== undefined ? { retainFrom: Boolean(action.retainFrom) } : {}) } as AnimationIntent;
  }
  if (type === 'camera') {
    if (!['zoom', 'pan', 'focus'].includes(action.action)) return null;
    return {
      type,
      action: action.action,
      ...(action.targetId ? { targetId: String(action.targetId) } : {}),
      ...(Number.isFinite(action.scale) ? { scale: Number(action.scale) } : {}),
      ...(Number.isFinite(action.x) ? { x: Number(action.x) } : {}),
      ...(Number.isFinite(action.y) ? { y: Number(action.y) } : {}),
    };
  }
  if (type === 'pause') return { type, durationMs: Math.max(0, Number(action.durationMs) || 350) };
  return null;
}

function normalizeLesson(raw: any, input: PlannerInput, dnaIds: string[]): AIGuruTeachingLesson {
  const segments = Array.isArray(raw?.segments) ? raw.segments : [];
  if (!segments.length) throw new Error('3B1B planner returned no teaching segments.');

  const normalizedSegments = segments.map((segment: any, segmentIndex: number) => {
    const rawBeats = Array.isArray(segment?.beats) ? segment.beats : [];
    if (!rawBeats.length) throw new Error(`3B1B planner returned no beats for segment ${segmentIndex + 1}.`);
    const beats: TeachingBeat[] = rawBeats.map((beat: any, beatIndex: number) => {
      const actions = (Array.isArray(beat?.actions) ? beat.actions : []).map(sanitizeAction).filter(Boolean) as AnimationIntent[];
      if (!String(beat?.narration ?? '').trim()) throw new Error(`3B1B beat ${segmentIndex + 1}.${beatIndex + 1} has no narration.`);
      if (!actions.length) actions.push({ type: 'pause', durationMs: 350 });
      const rawDnaId = String(beat?.dna?.dnaId || dnaIds[0] || 'none');
      const safeDnaId = dnaIds.includes(rawDnaId) ? rawDnaId : (dnaIds[0] || 'none');
      const dna = beat?.dna && beat.dna.archetype ? {
        dnaId: safeDnaId,
        archetype: String(beat.dna.archetype),
        ...(beat.dna.constructionStep ? { constructionStep: String(beat.dna.constructionStep) } : {}),
        ...(beat.dna.motif ? { motif: String(beat.dna.motif) } : {}),
      } : undefined;
      // Teacher-Reading extensions (optional, backward-compatible)
      const read = beat?.read && (beat.read.en || beat.read.ml)
        ? { en: String(beat.read.en || ''), ml: String(beat.read.ml || '') }
        : undefined;
      const explain = beat?.explain && (beat.explain.en || beat.explain.ml)
        ? { en: String(beat.explain.en || ''), ml: String(beat.explain.ml || '') }
        : undefined;
      const checkQuestion = beat?.checkQuestion && (beat.checkQuestion.en || beat.checkQuestion.ml)
        ? { en: String(beat.checkQuestion.en || ''), ml: String(beat.checkQuestion.ml || '') }
        : undefined;
      const sourceCueId = beat?.sourceCueId ? String(beat.sourceCueId) : undefined;

      // Prefer explain.en as the primary narration when present
      const narration = String(
        (explain?.en && explain.en.trim()) || beat.narration || ''
      );
      if (!narration.trim()) throw new Error(`3B1B beat ${segmentIndex + 1}.${beatIndex + 1} has no narration.`);

      return {
        id: String(beat.id || `segment-${segmentIndex + 1}-beat-${beatIndex + 1}`),
        narration,
        cueWords: Array.isArray(beat.cueWords) ? beat.cueWords.map(String).slice(0, 8) : [],
        durationMs: Math.max(600, Number(beat.durationMs) || 1400),
        visualIntent: beat.visualIntent || 'draw',
        targetObjects: Array.isArray(beat.targetObjects) ? beat.targetObjects.map(String) : [],
        actions,
        ...(dna ? { dna } : {}),
        ...(sourceCueId ? { sourceCueId } : {}),
        ...(read ? { read } : {}),
        ...(explain ? { explain } : {}),
        ...(checkQuestion ? { checkQuestion } : {}),
      };
    });
    return {
      id: String(segment.id || `segment-${segmentIndex + 1}`),
      title: String(segment.title || `Part ${segmentIndex + 1}`),
      order: Number.isFinite(segment.order) ? Number(segment.order) : segmentIndex,
      intuition: {
        explanation: String(segment.intuition?.explanation || ''),
        ...(segment.intuition?.visualMetaphor ? { visualMetaphor: String(segment.intuition.visualMetaphor) } : {}),
        ...(segment.intuition?.concreteExample ? { concreteExample: String(segment.intuition.concreteExample) } : {}),
      },
      mathematics: {
        explanation: String(segment.mathematics?.explanation || ''),
        expressions: Array.isArray(segment.mathematics?.expressions) ? segment.mathematics.expressions.map(String) : [],
        verified: false,
      },
      beats,
      narration: segment.narration ? String(segment.narration) : undefined,
      estimatedDurationMs: beats.reduce((sum, beat) => sum + (beat.durationMs || 0), 0),
    };
  });

  const visualGrammar = raw?.visualGrammar || {};
  let textbookPage: import('../../lesson/textbook-cursor').TextbookPage | undefined;
  const suppliedPageJson = input.textbookPageJson?.trim();
  if (suppliedPageJson) {
    try {
      const parsed = JSON.parse(suppliedPageJson);
      if (parsed && Number.isFinite(Number(parsed.pageNumber)) && Array.isArray(parsed.paragraphs)) {
        textbookPage = parsed;
      }
    } catch {
      // Invalid page JSON is treated as absent; the route/QA layer will report missing reading cues.
    }
  }
  return {
    schemaVersion: '2.1',
    id: String(raw?.id || `lesson-${Date.now()}`),
    title: String(raw?.title || input.question),
    grade: input.grade,
    gradeBand: gradeBand(input.grade),
    domain: input.domain,
    openingQuestion: String(raw?.openingQuestion || input.question),
    whyItMatters: String(raw?.whyItMatters || 'Connect the visual idea to the mathematical rule.'),
    ...(raw?.openingTeacher && (raw.openingTeacher.en || raw.openingTeacher.ml) ? { openingTeacher: { en: String(raw.openingTeacher.en || ''), ml: String(raw.openingTeacher.ml || '') } } : {}),
    ...(raw?.whyItMattersTeacher && (raw.whyItMattersTeacher.en || raw.whyItMattersTeacher.ml) ? { whyItMattersTeacher: { en: String(raw.whyItMattersTeacher.en || ''), ml: String(raw.whyItMattersTeacher.ml || '') } } : {}),
    learningGoal: String(raw?.learningGoal || input.learningGoal || input.question),
    prerequisites: Array.isArray(raw?.prerequisites) ? raw.prerequisites.map((p: any, i: number) => ({ id: String(p.id || `prerequisite-${i + 1}`), title: String(p.title || ''), reason: String(p.reason || ''), required: p.required !== false })) : [],
    runningExample: {
      id: String(raw?.runningExample?.id || 'running-example'),
      description: String(raw?.runningExample?.description || input.question),
      ...(raw?.runningExample?.expression || input.expression ? { expression: String(raw?.runningExample?.expression || input.expression) } : {}),
      persistentObjectIds: Array.isArray(raw?.runningExample?.persistentObjectIds) ? raw.runningExample.persistentObjectIds.map(String) : [],
    },
    segments: normalizedSegments,
    finalInsight: String(raw?.finalInsight || input.learningGoal || input.question),
    visualGrammar: {
      archetype: String(visualGrammar.archetype || 'progressive-construction'),
      dnaIds: Array.isArray(visualGrammar.dnaIds) ? visualGrammar.dnaIds.map(String) : dnaIds,
      constructionPattern: String(visualGrammar.constructionPattern || 'build-transform-build'),
      motifs: Array.isArray(visualGrammar.motifs) ? visualGrammar.motifs.map(String) : [],
      pacing: ['slow', 'medium', 'fast'].includes(visualGrammar.pacing) ? visualGrammar.pacing : 'medium',
      camera: ['static', 'focus', 'cinematic'].includes(visualGrammar.camera) ? visualGrammar.camera : 'focus',
      beatMix: visualGrammar.beatMix && typeof visualGrammar.beatMix === 'object' ? { build: Number(visualGrammar.beatMix.build || 0), transform: Number(visualGrammar.beatMix.transform || 0), move: Number(visualGrammar.beatMix.move || 0), remove: Number(visualGrammar.beatMix.remove || 0) } : undefined,
      qaRules: Array.isArray(visualGrammar.qaRules) ? visualGrammar.qaRules.map(String).slice(0, 12) : [],
    },
    difficulty: difficultyProfile(input.grade),
    ...(input.expression ? { expression: input.expression } : {}),
    ...(textbookPage ? { textbookPage } : {}),
  };
}

function buildPrompt(input: PlannerInput, dnaText: string, chapterStrategyText = '', lessonStrategyText = ''): string {
  let readingManifest = 'not supplied';
  if (input.textbookPageJson) {
    try {
      const page = JSON.parse(input.textbookPageJson);
      const cues = Array.isArray(page?.paragraphs)
        ? page.paragraphs.flatMap((p: any) => Array.isArray(p?.sentences) ? p.sentences : [])
            .filter((s: any) => s?.readable !== false)
            .map((s: any) => `${String(s.id)} | ${String(s.text)}`)
            .join('\n')
        : '';
      if (cues) readingManifest = cues;
    } catch {
      readingManifest = 'invalid page JSON';
    }
  }
  return `You are AI Guru's 3B1B-style mathematics teaching planner for Kerala State and CBSE Classes 1-12.

Create an ORIGINAL teaching lesson. Do not copy source videos, narration, artwork, examples, or code. Video-DNA is only a visual grammar reference.

QUESTION: ${input.question}
GRADE: ${input.grade}
DOMAIN: ${input.domain}
LANGUAGE: ${input.language || 'english'}
LEARNING GOAL: ${input.learningGoal || input.question}
EXPRESSION: ${input.expression || 'none'}
CHAPTER: ${input.chapterTitle || 'not supplied'}
TEXTBOOK CONTEXT: ${(input.textbookContext || 'not supplied').slice(0, 4500)}
TEXTBOOK PAGE STRUCTURE: ${(input.textbookPageJson || 'not supplied').slice(0, 14000)}
READING MANIFEST (EVERY CUE MUST BE TAUGHT IN ORDER):
${readingManifest}
TEACHER-READING MODE: ${input.teacherReadingMode ? 'ON' : 'OFF'}
DIFFICULTY PROFILE: ${JSON.stringify(difficultyProfile(input.grade))}
${chapterStrategyText}
${lessonStrategyText}
${input.repairInstructions ? `REPAIR INSTRUCTIONS FROM QA:\n${input.repairInstructions}` : ''}

VIDEO-DNA VISUAL GRAMMAR:
${dnaText || 'Use progressive mathematical construction and transformation.'}

TEACHER-READING MODE (mandatory when textbook context is supplied):
The class follows the cycle: READ → TRANSLATE → EXPLAIN → VISUALIZE → CHECK → CONTINUE.
For every meaningful textbook sentence the teacher must:
  a. READ the original English sentence (field "read.en").
  b. TRANSLATE it into natural Malayalam (field "read.ml").
  c. EXPLAIN why it matters, what is known / unknown (fields "explain.en" + "explain.ml").
  d. Only then draw a visual beat on the whiteboard.
Never put extracted textbook paragraphs or long prose on the whiteboard.
The board receives only concise labels, equations, diagrams, arrows and transformations.
The teacher voice carries the detailed explanation.

PEDAGOGICAL REQUIREMENTS:
1. Start with the textbook heading/topic: say what the idea is, why it exists, and where a learner meets it in ordinary life. Put the bilingual spoken framing in openingTeacher and whyItMattersTeacher.
2. Before solving the exercise, explain the situation in plain teacher language: what is known, what is unknown, what the question asks, and a simple plan.
3. If variables such as x, y, z, a or b are introduced, explicitly define what each one represents before manipulating it.
4. Explain common mistakes and how to avoid them at the point where they could occur.
5. Use a persistent running example and return to it after each conceptual step.
6. Teach intuition before formal mathematics.
7. Move from concrete/pictorial representation toward symbols, then to the verified mathematical operation.
8. Each segment must contain 2-6 meaningful visual beats.
9. Each beat must describe one visual teaching action, not a paragraph of board text.
10. The whiteboard is a visual canvas: NEVER place extracted textbook paragraphs or long prose on it. Use concise labels, equations, diagrams, arrows, highlights and transformations; the teacher voice/caption carries the detailed explanation.
11. Preserve semantic object identity across transformations.
12. Use build -> transform -> insight where mathematically appropriate.
13. Use camera focus/zoom sparingly to direct attention.
14. Cue words must be actual words spoken in the beat narration.
15. Choose a Video-DNA archetype and construction step for every beat when possible.
16. Use only DNA IDs supplied in the VIDEO-DNA context; never invent a DNA ID.
17. Prefer the chapter archetypes for continuity, but override them when the problem's visual concept requires a different archetype.
18. Adapt complexity to the student's grade using the supplied difficulty profile: respect segment/beat limits, narration length and prerequisite depth.
19. Treat the supplied beat-mix as a target grammar, not decorative metadata; use build/transform/move/remove actions in approximately those proportions when mathematically appropriate.
20. Treat supplied QA rules as executable design constraints: safe frame, readable text, non-overlap, visible construction, and insight pause.
21. Use textbook context to ground terminology and the specific concept being taught; never copy source prose.
22. For Malayalam narration, write natural Malayalam sentences but KEEP mathematical and technical terms in English (for example variable, equation, coefficient, constant, term, expression, substitution, elimination, solution, graph, slope, function). Do not transliterate technical terminology into Malayalam script.
23. In Malayalam narration, pronounce variable names x, y, z, a, b and similar symbols as English letter names (ex, why, zee, ay, bee) and keep the symbols visible in the mathematics.
24. When textbook context or textbookPageJson is supplied, every beat that teaches a textbook sentence MUST include:
     - sourceCueId  (e.g. "p7-para2-s1")
     - read: { "en": "<exact textbook sentence>", "ml": "<natural Malayalam translation>" }
     - explain: { "en": "<teacher explanation>", "ml": "<Malayalam explanation>" }
   Optional: checkQuestion: { "en": "...", "ml": "..." }
25. The "narration" field remains required for backward compatibility; set it to explain.en (or read.en if no explanation).

ALLOWED ANIMATION ACTIONS:
create, draw, move, transform, morph, highlight, indicate, erase, camera, pause.

CREATE ACTION:
{ "type":"create", "objectId":"triangle", "node":{"id":"triangle","kind":"shape","x":100,"y":100,"width":200,"height":150,"shape":"triangle","style":{"strokeWidth":4}} }

MOVE ACTION:
{ "type":"move", "objectId":"point-1", "toX":400, "toY":250 }

TRANSFORM/MORPH:
{ "type":"transform", "fromObjectId":"equation-1", "toObjectId":"equation-2" }

CAMERA:
{ "type":"camera", "action":"zoom", "targetId":"angle-1", "scale":1.6 }

Return ONLY JSON matching this shape:
{
  "schemaVersion":"2.1",
  "id":"...",
  "title":"...",
  "openingQuestion":"...",
  "whyItMatters":"...",
  "openingTeacher":{"en":"...","ml":"..."},
  "whyItMattersTeacher":{"en":"...","ml":"..."},
  "learningGoal":"...",
  "prerequisites":[{"id":"...","title":"...","reason":"...","required":true}],
  "runningExample":{"id":"...","description":"...","expression":"...","persistentObjectIds":["..."]},
  "visualGrammar":{"archetype":"...","dnaIds":["..."],"constructionPattern":"build-transform-build","motifs":["..."],"pacing":"slow|medium|fast","camera":"static|focus|cinematic","beatMix":{"build":0.5,"transform":0.3,"move":0.15,"remove":0.05},"qaRules":["..."]},
  "segments":[{
    "id":"...",
    "title":"...",
    "order":0,
    "intuition":{"explanation":"...","visualMetaphor":"..."},
    "mathematics":{"explanation":"...","expressions":["..."],"verified":false},
    "beats":[{
      "id":"...",
      "sourceCueId":"p7-para2-s1",
      "read":{"en":"There are 100 beads, black and white, in a box; 10 more black than white.","ml":"ഒരു പെട്ടിയിൽ ആകെ 100 beads ഉണ്ട്. അതിൽ black beads, white beads-നേക്കാൾ 10 എണ്ണം കൂടുതലാണ്."},
      "explain":{"en":"So we know the total is 100. We still do not know how many are black and how many are white.","ml":"അതായത് ആകെ 100 ആണെന്ന് നമുക്കറിയാം. എന്നാൽ എത്ര black, എത്ര white എന്ന് ഇതുവരെ അറിയില്ല."},
      "narration":"So we know the total is 100. We still do not know how many are black and how many are white.",
      "cueWords":["total","100","black","white"],
      "durationMs":1400,
      "visualIntent":"create|draw|transform|move|morph|highlight|compare|derive|graph|geometry|camera|pause",
      "targetObjects":["..."],
      "actions":[{"type":"pause","durationMs":350}],
      "dna":{"dnaId":"...","archetype":"...","constructionStep":"...","motif":"..."},
      "checkQuestion":{"en":"What do we still not know?","ml":"നമുക്ക് ഇനിയും അറിയാത്തത് എന്താണ്?"}
    }]
  }],
  "finalInsight":"..."
}

Do not output TypeScript, Python, HTML, SVG, Manim code, or URLs.`;
}


/**
 * Deterministic emergency teacher lesson.
 *
 * This is deliberately NOT a replacement for Gemini 3B1B planning. It is a
 * bounded start-path so a temporary Gemini timeout cannot leave the classroom
 * unusable. It uses the textbook page/cues already supplied by the classroom,
 * keeps the whiteboard concise, and never invents mathematical solution steps.
 */
export function buildLocalTeacherLesson(input: PlannerInput): AIGuruTeachingLesson {
  const page = (() => {
    try {
      const parsed = input.textbookPageJson ? JSON.parse(input.textbookPageJson) : null;
      return parsed && Array.isArray(parsed.paragraphs) ? parsed : null;
    } catch { return null; }
  })();
  const sentences = (page?.paragraphs ?? []).flatMap((p: any) => Array.isArray(p?.sentences) ? p.sentences : [])
    .filter((s: any) => s?.readable !== false && String(s?.text || '').trim())
    .slice(0, 6);
  const source = sentences.map((s: any) => String(s.text).trim()).join(' ')
    || String(input.question || '').replace(/^Textbook passage:\s*/i, '').trim();
  const eqs = [...new Set((source.match(/[A-Za-z0-9().+\-−×*/^²³√\s]{1,70}\s*=\s*[A-Za-z0-9().+\-−×*/^²³√\s]{1,35}/g) ?? [])
    .map((x: string) => x.replace(/\s+/g, ' ').trim()).filter(x => x.length <= 90))].slice(0, 3);
  const labelFor = (text: string, index: number) => {
    if (index === 0) return input.chapterTitle || 'What are we learning?';
    if (/\?|problem|question|find|calculate|determine/i.test(text)) return 'What is the problem asking?';
    if (/let\s+[xyz]|taking .* as [xyz]|unknown|variable/i.test(text)) return 'Define the unknown';
    if (/=/i.test(text) || eqs.length) return index % 2 ? 'Form the equation' : 'Mathematical relationship';
    return index === 1 ? 'Understand the given information' : 'Key idea';
  };
  const mlGeneric = (text: string, kind: 'read'|'explain') => {
    const t = text.trim();
    if (kind === 'read') return `ഈ textbook വാചകം: ${t}`;
    if (/unknown|variable/i.test(t)) return 'ഇവിടെ variable ഒരു അറിയാത്ത അളവിനെ സൂചിപ്പിക്കുന്നു. x, y, z എന്നീ പേരുകൾ English letter names ആയി തന്നെ പറയാം.';
    if (/=/i.test(t)) return 'ഈ ബന്ധം equation ആയി whiteboard-ൽ കാണിക്കാം. Technical terms English-ൽ തന്നെ ഉപയോഗിക്കാം.';
    return 'ഈ ഭാഗം ആദ്യം മനസ്സിലാക്കാം. പിന്നെ അതിന്റെ mathematical idea whiteboard-ൽ നിർമ്മിക്കാം.';
  };
  const beats = (sentences.length ? sentences : [{ id: `p${page?.pageNumber || 1}-fallback-s1`, text: source, type: 'body' }]).slice(0, 6).map((sentence: any, i: number) => {
    const text = String(sentence.text || source).trim();
    const label = labelFor(text, i);
    const id = `fallback-beat-${i + 1}`;
    const objectId = `fallback-${i + 1}`;
    const isEquation = /=/.test(text) || (i > 1 && eqs[i - 1]);
    const node: any = isEquation
      ? { id: objectId, kind: 'latex', x: 120, y: 110 + i * 82, latex: (eqs[Math.min(i - 1, eqs.length - 1)] || text).slice(0, 70), style: { fontSize: 40 } }
      : { id: objectId, kind: 'text', x: 120, y: 110 + i * 82, content: label, width: 700, height: 52, style: { fontSize: 32 } };
    const readMl = String(input.teacherSourceMalayalam || '').trim() || mlGeneric(text, 'read');
    const explainEn = /\?|problem|find|calculate/i.test(text)
      ? 'First identify what is known, what is unknown, and exactly what the question asks.'
      : /let\s+[xyz]|unknown|variable/i.test(text)
        ? 'A variable is a name for an unknown quantity. Define it before doing any operation.'
        : /=/.test(text)
          ? 'This equation connects the known information to the unknown. We will change one step at a time and keep the meaning clear.'
          : 'Read the textbook idea first. Then we turn the important relationship into a simple visual on the whiteboard.';
    const explainMl = String(input.teacherExplanationMalayalam || '').trim() || mlGeneric(explainEn, 'explain');
    return {
      id,
      sourceCueId: sentence.id || `p${page?.pageNumber || 1}-fallback-s${i + 1}`,
      read: { en: text, ml: readMl },
      explain: { en: explainEn, ml: explainMl },
      narration: explainEn,
      cueWords: text.split(/\s+/).slice(0, 6),
      durationMs: 2200,
      visualIntent: isEquation ? 'derive' : 'create',
      targetObjects: [objectId],
      actions: [{ type: 'create', objectId, node }],
    };
  });
  while (beats.length < 4) {
    const i = beats.length;
    const objectId = `fallback-${i + 1}`;
    beats.push({ id:`fallback-beat-${i + 1}`, narration:'Let us connect the idea to the problem.', cueWords:['connect','idea','problem'], durationMs:1800, visualIntent:'create', targetObjects:[objectId], actions:[{ type:'create', objectId, node:{ id:objectId, kind:'text', x:120, y:260, content:'Connect the idea → the problem', width:700, height:52, style:{fontSize:32} } }] });
  }
  const mid = Math.max(2, Math.ceil(beats.length / 2));
  const segments = [
    { id:'fallback-understand', title:'Understand the textbook idea', order:0, intuition:{ explanation:'Start from the words and identify the important quantities and relationships.' }, mathematics:{ explanation:'We will introduce symbols only after the meaning is clear.', expressions:eqs }, beats:beats.slice(0, mid) },
    { id:'fallback-apply', title:'Apply it to the problem', order:1, intuition:{ explanation:'Use the identified relationship to build the solution step by step.' }, mathematics:{ explanation:'Carry out only verified mathematical operations supplied by the textbook context.', expressions:eqs }, beats:beats.slice(mid) },
  ];
  if (!segments[1].beats.length) segments[1].beats.push({ id:'fallback-apply-beat', narration:'Now apply the idea to the question.', cueWords:['apply','idea','question'], durationMs:1800, visualIntent:'pause', targetObjects:[], actions:[{type:'pause',durationMs:700}] });
  return {
    schemaVersion:'2.1', id:`local-teacher:${Date.now()}`, title:input.chapterTitle || input.question.slice(0,120), grade:input.grade, gradeBand:gradeBand(input.grade), domain:input.domain,
    openingQuestion: input.chapterTitle ? `What is ${input.chapterTitle}?` : input.question,
    whyItMatters:'Understand the idea first, then use it to solve the problem and recognize it in ordinary situations.',
    openingTeacher:{ en: input.chapterTitle ? `Today we will understand ${input.chapterTitle} before solving the problem.` : 'First, let us understand the situation before solving the problem.', ml: 'ആദ്യം ആശയം മനസ്സിലാക്കാം. അതിന് ശേഷം problem step by step ആയി solve ചെയ്യാം.' },
    whyItMattersTeacher:{ en:'A good solution starts by knowing what is given, what is unknown, and what the symbols mean.', ml:'നല്ല solution തുടങ്ങുന്നത് given information, unknown quantity, symbols എന്നിവ വ്യക്തമായി മനസ്സിലാക്കിയ ശേഷമാണ്.' },
    learningGoal:input.learningGoal || input.question,
    prerequisites:[], runningExample:{ id:'fallback-running-example', description:input.question, expression:eqs[0], persistentObjectIds:beats.flatMap(b=>b.actions.filter((a:any)=>a.type==='create').map((a:any)=>a.objectId)).slice(0,6) },
    segments, finalInsight:'Explain the meaning first, then use the mathematics to solve and check the answer.', visualGrammar:{ archetype:'progressive-construction', dnaIds:[], constructionPattern:'build-transform-build', motifs:['teacher-reading','meaning-before-symbols'], pacing:'medium', camera:'focus', beatMix:{build:0.7,transform:0.1,move:0.1,remove:0.1}, qaRules:['safe frame','concise visual labels','insight pause'] }, difficulty:difficultyProfile(input.grade), textbookPage:page || undefined,
  };
}

export async function generateTeachingLesson(input: PlannerInput): Promise<AIGuruTeachingLesson> {
  const key = input.byokKey?.trim() || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured for 3B1B teaching planning.');

  const chapterStrategy = input.chapterTitle || input.chapterSummary || (input.chapterTopics?.length ?? 0)
    ? await selectChapterVideoDna({ chapterTitle: input.chapterTitle, chapterSummary: input.chapterSummary, chapterTopics: input.chapterTopics, domain: input.domain, learningGoal: input.learningGoal, grade: input.grade })
    : undefined;
  const lessonStrategy = await selectLessonVideoDna({
    chapterTitle: input.chapterTitle,
    chapterSummary: input.chapterSummary,
    chapterTopics: input.chapterTopics,
    question: input.question,
    learningGoal: input.learningGoal,
    domain: input.domain,
    grade: input.grade,
  }, chapterStrategy);
  const dnaHits = lessonStrategy.selections.map(selection => selection.hit);
  const beatOptionText = lessonStrategy.beatOptions.map(selection => `- ${selection.id}: ${selection.archetype} score=${selection.score.toFixed(3)} reasons=${selection.reasons.join(', ')}`).join('\n');
  const dnaText = dnaHits.map(hit => hit.text).join('\n\n---\n\n');
  const dnaIds = dnaHits.map(hit => hit.id.replace(/^video-dna:/, ''));
  const chapterText = chapterStrategy ? `\nCHAPTER VISUAL STRATEGY:\nArchetypes: ${chapterStrategy.archetypes.join(', ')}\nDNA IDs: ${chapterStrategy.dnaIds.join(', ')}\nConstruction patterns: ${chapterStrategy.constructionPatterns.join(' | ')}\nMotifs: ${chapterStrategy.motifs.join(' | ')}\nPacing: ${chapterStrategy.pacing}; Camera: ${chapterStrategy.camera}\nBeat mix: ${JSON.stringify(chapterStrategy.beatMix)}\nQA rules: ${chapterStrategy.qaRules.join(' | ')}\n` : '';
  const lessonText = `\nLESSON/BEAT DNA OPTIONS:\n${beatOptionText}\nTarget beat mix: ${JSON.stringify(lessonStrategy.beatMix)}\nQA rules: ${lessonStrategy.qaRules.join(' | ')}\n`;
  const prompt = buildPrompt(input, dnaText, chapterText, lessonText);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Gemini 3B1B planning timed out after 12 seconds.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`Gemini 3B1B teaching planning failed: ${response.status}`);
  const data = await response.json() as any;
  const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
  const lesson = normalizeLesson(extractJson(text), input, dnaIds);
  lesson.visualGrammar.beatMix = lesson.visualGrammar.beatMix ?? lessonStrategy.beatMix;
  lesson.visualGrammar.qaRules = lesson.visualGrammar.qaRules?.length ? lesson.visualGrammar.qaRules : lessonStrategy.qaRules;
  lesson.difficulty = difficultyProfile(input.grade);

  const beatCount = lesson.segments.reduce((sum, segment) => sum + segment.beats.length, 0);
  if (beatCount < 2) throw new Error('3B1B teaching lesson is too short: at least 2 beats are required.');
  if (!lesson.runningExample.persistentObjectIds.length) {
    const createdIds = lesson.segments.flatMap(segment => segment.beats.flatMap(beat => beat.actions.filter(action => action.type === 'create').map(action => action.objectId)));
    lesson.runningExample.persistentObjectIds.push(...[...new Set(createdIds)].slice(0, 6));
  }
  return lesson;
}
