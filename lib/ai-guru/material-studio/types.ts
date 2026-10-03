import type { VisualAction } from '../lesson/types';

export const MATERIAL_TYPES = [
  'mcq', 'qa', 'revision-notes', 'flashcards', 'worksheet', 'question-paper',
  'ppt', 'mind-map', 'whiteboard-notes', 'knowledge-base', 'problems-formulae',
] as const;
export type MaterialType = typeof MATERIAL_TYPES[number];

export interface IndexedSource {
  id: string;
  page: number;
  paragraph: number;
  text: string;
  title?: string;
  chapterId?: string;
  chapterTitle?: string;
}

export interface BookChapter {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  sourceIds: string[];
  summary?: string;
}

export interface IndexedDocument {
  id: string;
  fileName: string;
  mimeType: string;
  pageCount: number;
  indexedAt: string;
  parser: string;
  subject: string;
  grade: string;
  syllabus: string;
  sourceLanguage: string;
  teachingLanguage: string;
  chapters: BookChapter[];
  sources: IndexedSource[];
}

export interface MathTeachingStep {
  id: string;
  before: string;
  operation: string;
  after: string;
  captionEnglish: string;
  captionMalayalam?: string;
  visualIds: string[];
  verified: boolean;
  source?: 'mathsteps' | 'sympy' | 'mathjs' | 'gemini' | 'manual';
}

export interface BilingualTeachingPass {
  sourceText: string;
  englishExplanation: string;
  translatedExplanation: string;
  visuals: VisualAction[];
  sourceIds: string[];
}

export interface StudyMaterialSection {
  id: string;
  heading: string;
  content: string;
  contentTranslation?: string;
  activity?: string;
  activityTranslation?: string;
  answer?: string;
  answerTranslation?: string;
  options?: string[];
  translatedOptions?: string[];
  sourceIds: string[];
  sourceText?: string;
  teachingPass?: BilingualTeachingPass;
  mathSteps?: MathTeachingStep[];
  visuals: VisualAction[];
  whiteboardCommands?: unknown;
  notes?: string;
}

export interface StudyMaterial {
  id: string;
  documentId: string;
  type: MaterialType;
  title: string;
  overview: string;
  overviewTranslation?: string;
  teachingLanguage: string;
  materialLanguages: string[];
  chapterIds?: string[];
  sections: StudyMaterialSection[];
  sources: IndexedSource[];
  qa: { status: 'passed'|'failed'|'needs_review'; score: number; issues: string[]; checkedAt: string };
  model: string;
  createdAt: string;
  updatedAt: string;
}
