import type { AIGuruLesson } from './types';
import type { Lesson } from '../contracts';
import { legacyLessonToCanonical } from '../integration/legacy-adapter';

/**
 * AI Guru native lesson compiler.
 *
 * Sprint 8.2 deliberately removes the OpenMAIC runtime contract from the
 * active classroom. Canonical Lesson JSON is the only internal teaching
 * representation. A legacy-compatible adapter is retained as a migration
 * helper and does not import any OpenMAIC package.
 */
export function compileAIGuruLesson(lesson: AIGuruLesson): Lesson {
  return legacyLessonToCanonical(lesson);
}
