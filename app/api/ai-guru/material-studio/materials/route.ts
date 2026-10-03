import { NextResponse } from 'next/server';
import { listMaterials, saveMaterial } from '@/lib/ai-guru/material-studio/store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('documentId') || undefined;
  return NextResponse.json({ ok: true, materials: await listMaterials(id) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.material?.id || !body.material.documentId) {
      return NextResponse.json({ ok: false, error: 'A valid generated material is required.' }, { status: 400 });
    }

    const qa = body.material.qa || {};
    const status = String(qa.status || 'unknown');
    const score = Number(qa.score || 0);

    // Accept "passed" always. Accept "needs_review" when score is strong enough
    // (bilingual soft flags must not block classroom use of an otherwise good material).
    const allowed =
      status === 'passed' ||
      (status === 'needs_review' && score >= 70);

    if (!allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `Material cannot be saved because QA status is ${status}${score ? ` (${score}/100)` : ''}.`,
          issues: Array.isArray(qa.issues) ? qa.issues.slice(0, 5) : [],
        },
        { status: 422 },
      );
    }

    const saved = await saveMaterial(body.material);
    return NextResponse.json({ ok: true, material: saved });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Material save failed.' },
      { status: 422 },
    );
  }
}
