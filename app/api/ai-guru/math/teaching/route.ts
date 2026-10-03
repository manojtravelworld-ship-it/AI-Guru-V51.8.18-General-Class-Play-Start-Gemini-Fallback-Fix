import { NextResponse } from 'next/server';
import { detectMathDomain } from '@/lib/ai-guru/math/universal';
import { generateTeachingLesson } from '@/lib/ai-guru/math/teaching';
import { compileAIGuruTeachingLesson } from '@/lib/ai-guru/math/animation';
import { evaluateTeachingLesson } from '@/lib/ai-guru/math/teaching/quality';
import { buildLocalTeacherLesson } from '@/lib/ai-guru/math/teaching/lesson-planner';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body?.question ?? body?.expression ?? '').trim();
    const grade = Number(body?.grade ?? 12);
    if (!question) return NextResponse.json({ ok: false, error: 'question is required' }, { status: 400 });
    if (!Number.isInteger(grade) || grade < 1 || grade > 12) return NextResponse.json({ ok: false, error: 'grade must be 1-12' }, { status: 400 });

    const domain = detectMathDomain(question);
    const language = body?.language === 'malayalam' ? 'malayalam' : 'english';
    const byokKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : undefined;
    const baseInput = {
      question, grade, domain, language: language as 'english' | 'malayalam',
      expression: typeof body?.expression === 'string' ? body.expression : undefined,
      learningGoal: typeof body?.learningGoal === 'string' ? body.learningGoal : undefined,
      byokKey,
      chapterTitle: typeof body?.chapterTitle === 'string' ? body.chapterTitle : undefined,
      chapterSummary: typeof body?.chapterSummary === 'string' ? body.chapterSummary : undefined,
      chapterTopics: Array.isArray(body?.chapterTopics) ? body.chapterTopics.map(String).slice(0, 20) : undefined,
      textbookContext: typeof body?.textbookContext === 'string' ? body.textbookContext.slice(0, 12000) : undefined,
      textbookPageJson: typeof body?.textbookPageJson === 'string' ? body.textbookPageJson.slice(0, 30000) : undefined,
      teacherReadingMode: body?.teacherReadingMode === true || typeof body?.textbookPageJson === 'string',
      teacherSourceMalayalam: typeof body?.teacherSourceMalayalam === 'string' ? body.teacherSourceMalayalam.slice(0, 6000) : undefined,
      teacherExplanationEnglish: typeof body?.teacherExplanationEnglish === 'string' ? body.teacherExplanationEnglish.slice(0, 6000) : undefined,
      teacherExplanationMalayalam: typeof body?.teacherExplanationMalayalam === 'string' ? body.teacherExplanationMalayalam.slice(0, 6000) : undefined,
    };

    let lesson = await generateTeachingLesson(baseInput);
    let quality = await evaluateTeachingLesson(lesson);
    let compiled = compileAIGuruTeachingLesson(lesson, { teachingLanguage: language, id: `3b1b:${lesson.id}` });

    for (let attempt = 1; attempt < 2 && (!quality.passed || compiled.warnings.length); attempt++) {
      const repairInstructions = [...quality.issues, ...compiled.warnings].slice(0, 14).join('\n');
      lesson = await generateTeachingLesson({ ...baseInput, repairInstructions: `Repair pass ${attempt}/1. Do not merely explain the failure; return a corrected lesson.\n${repairInstructions}` });
      quality = await evaluateTeachingLesson(lesson);
      compiled = compileAIGuruTeachingLesson(lesson, { teachingLanguage: language, id: `3b1b:${lesson.id}` });
    }

    lesson.quality = quality;
    lesson.segments.forEach(segment => { segment.mathematics.verified = quality.checks['math-correctness'] === true; });
    compiled = compileAIGuruTeachingLesson(lesson, { teachingLanguage: language, id: `3b1b:${lesson.id}` });
    const allWarnings = [...new Set([...compiled.warnings, ...quality.issues])];

    return NextResponse.json({
      ok: true,
      source: baseInput.teacherReadingMode ? 'gemini-3b1b-video-dna-teacher-reading-qa' : 'gemini-3b1b-video-dna-qa',
      lesson,
      scene: compiled.scene,
      sceneGraph: { persistentIds: [...compiled.sceneGraph.persistentIds], objectIds: [...compiled.sceneGraph.objects.keys()] },
      quality,
      warnings: allWarnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[AI Guru][3B1B teaching] planner failure; attempting local teacher fallback:', message);
    // General Class must still be able to start when Gemini is temporarily slow or
    // unavailable. The fallback is deterministic and grounded only in the supplied
    // textbook page; it never invents a verified solution. Problems & Formulae is
    // unaffected because it uses its dedicated playback path.
    if (baseInput.teacherReadingMode && /timed out|failed: 5|failed: 4(0[13]|29)|fetch/i.test(message)) {
      try {
        const fallbackLesson = buildLocalTeacherLesson(baseInput);
        const fallbackQuality = await evaluateTeachingLesson(fallbackLesson);
        fallbackLesson.quality = fallbackQuality;
        fallbackLesson.segments.forEach(segment => { segment.mathematics.verified = fallbackQuality.checks['math-correctness'] === true; });
        const fallbackCompiled = compileAIGuruTeachingLesson(fallbackLesson, { teachingLanguage: language, id: `3b1b:fallback:${fallbackLesson.id}` });
        return NextResponse.json({
          ok: true, source: 'local-teacher-reading-fallback', fallback: true,
          warning: `Gemini planner unavailable: ${message}`, lesson: fallbackLesson, scene: fallbackCompiled.scene,
          sceneGraph: { persistentIds: [...fallbackCompiled.sceneGraph.persistentIds], objectIds: [...fallbackCompiled.sceneGraph.objects.keys()] },
          quality: fallbackQuality, warnings: [...new Set([...fallbackCompiled.warnings, ...fallbackQuality.issues, 'Gemini planner was unavailable; deterministic textbook-reading fallback used.'])],
        });
      } catch (fallbackError) {
        console.error('[AI Guru][3B1B teaching] local fallback failed:', fallbackError);
      }
    }
    const status = /GEMINI_API_KEY is not configured/i.test(message) ? 400 : /timed out/i.test(message) ? 504 : /Gemini .*failed: 4(0[13]|29)/i.test(message) ? 502 : 502;
    return NextResponse.json({ ok: false, error: message, source: '3b1b-planner' }, { status });
  }
}
