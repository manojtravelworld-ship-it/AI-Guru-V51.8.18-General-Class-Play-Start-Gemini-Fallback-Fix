import { describe, expect, it } from 'vitest';
import { buildEquationMotion, layoutTokens, tokenizeMath } from './visual-motion';

describe('visual mathematical construction motion',()=>{
  it('tokenizes individual mathematical objects',()=>{
    const t=layoutTokens(tokenizeMath('3x + 5 = 20'));
    expect(t.map(x=>x.text)).toEqual(['3','x','+','5','=','20']);
    expect(new Set(t.map(x=>x.id)).size).toBe(t.length);
  });
  it('builds continuous from/to motion metadata',()=>{
    const m=buildEquationMotion('3x + 5 = 20','3x = 15');
    expect(m.from.length).toBeGreaterThan(0); expect(m.to.length).toBeGreaterThan(0);
    expect(m.operations.length).toBeGreaterThan(0);
  });
});
