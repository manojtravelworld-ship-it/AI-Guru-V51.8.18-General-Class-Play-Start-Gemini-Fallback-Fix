export interface MotionToken { id: string; text: string; x: number; y: number; width: number; kind: 'digit'|'operator'|'symbol'|'word'; }

export function tokenizeMath(text: string): MotionToken[] {
  const cleaned = String(text ?? '').replace(/\\cdot/g,'·').replace(/\\times/g,'×').replace(/\\pm/g,'±').replace(/\\left|\\right/g,'');
  const raw = cleaned.match(/\d+(?:\.\d+)?|[A-Za-z]+|[+−\-×÷=()²³^±/<>]|\S/g) ?? [];
  const tokens: MotionToken[] = [];
  let x = 0;
  for (let i=0;i<raw.length;i++) {
    const text=raw[i];
    const kind=/^\d/.test(text)?'digit':/^[+−\-×÷=^±/<>]$/.test(text)?'operator':/^[()²³]$/.test(text)?'symbol':'word';
    const width=Math.max(30, text.length*30+14);
    tokens.push({id:`tok-${i}`,text,x,y:0,width,kind}); x+=width+10;
  }
  return tokens;
}

export function layoutTokens(tokens: MotionToken[], centerX=480, y=260): MotionToken[] {
  const total=tokens.reduce((a,t)=>a+t.width,0)+Math.max(0,tokens.length-1)*10;
  let x=centerX-total/2;
  return tokens.map(t=>{const out={...t,x,y};x+=t.width+10;return out;});
}

export function buildEquationMotion(from: string|undefined, to: string): {from:MotionToken[];to:MotionToken[];operations:string[]} {
  const a=layoutTokens(tokenizeMath(from??''));
  const b=layoutTokens(tokenizeMath(to));
  const operations:string[]=[];
  const aText=a.map(t=>t.text).join(''); const bText=b.map(t=>t.text).join('');
  if (/−5|\-5/.test(bText) && /\+/.test(bText)) operations.push('balance both sides');
  if (aText!==bText) operations.push('transform equivalent form');
  return {from:a,to:b,operations};
}
