import type { UniversalMathStep } from '../universal/types';

export interface MathStepEngineResult {
  steps: UniversalMathStep[];
  finalAnswer?: string;
  engine: 'mathsteps';
  available: boolean;
  error?: string;
}

/** Converts MathSteps output into AI Guru's renderer-neutral step IR. */
export async function generateMathSteps(expression: string, paragraphId = 'problem'): Promise<MathStepEngineResult> {
  try {
    const ms: any = await import('mathsteps');
    if (!/=/.test(expression) || typeof ms.solveEquation !== 'function') {
      return { engine: 'mathsteps', available: true, steps: [], error: 'MathSteps solveEquation requires an equation.' };
    }
    const raw = ms.solveEquation(expression) as any[];
    const steps: UniversalMathStep[] = [];
    let previous = expression;
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      const after = typeof item?.newEquation === 'string' ? item.newEquation : typeof item?.getNewEquation === 'function' ? item.getNewEquation().toString() : typeof item?.toString === 'function' ? item.toString() : String(item);
      const before = typeof item?.oldEquation === 'string' ? item.oldEquation : typeof item?.getOldEquation === 'function' ? item.getOldEquation().toString() : previous;
      const operation = typeof item?.changeType === 'string' ? item.changeType : typeof item?.getChangeType === 'function' ? String(item.getChangeType()) : 'mathematical-transformation';
      if (!after || after === '[object Object]') continue;
      steps.push({ id: `${paragraphId}:mathstep:${i + 1}`, title: `Step ${i + 1}`, purpose: operation, before, after, operation, source: 'mathsteps', verified: true });
      previous = after;
    }
    return { engine: 'mathsteps', available: true, steps, finalAnswer: steps.at(-1)?.after };
  } catch (error) {
    return { engine: 'mathsteps', available: false, steps: [], error: error instanceof Error ? error.message : String(error) };
  }
}
