import type { MathVerificationResult, MathVerifier } from './adapter';

export class MathJsMathstepsVerifier implements MathVerifier {
  async verify(expression:string, expected?:string):Promise<MathVerificationResult>{
    try {
      const math:any=await import('mathjs');
      const normalized=String(math.simplify(expression));
      if(expected!==undefined){
        const left=math.simplify(expression); const right=math.simplify(expected);
        if(String(left)!==String(right)) return {valid:false,expression,normalized,errors:['Math.js simplification differs from expected expression.']};
      }
      let steps:any[]=[];
      try { const ms:any=await import('mathsteps'); if(/=/.test(expression)&&typeof ms.solveEquation==='function') steps=ms.solveEquation(expression).map((s:any)=>s.toString?.()||s); } catch {}
      return {valid:true,expression,normalized,errors:[],...(steps.length?{steps}:{} )} as MathVerificationResult;
    } catch(error){return {valid:false,expression,errors:[error instanceof Error?error.message:'Math.js verification failed. Install mathjs/mathsteps.']};}
  }
}
