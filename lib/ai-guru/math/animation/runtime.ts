import type { MathVisualEvent, MathVisualNode, UniversalMathScene } from '../universal/types';

export interface RuntimeCamera { x: number; y: number; scale: number; }
export interface RuntimeNodeState extends MathVisualNode { opacity: number; rotation?: number; scale?: number; highlighted?: boolean; }
export interface RuntimeSnapshot { timeMs: number; nodes: Map<string, RuntimeNodeState>; camera: RuntimeCamera; activeEventIds: string[]; }

const clamp = (v:number, lo=0, hi=1) => Math.min(hi, Math.max(lo, v));
const lerp = (a:number,b:number,t:number) => a + (b-a)*t;
const easeInOut = (t:number) => t < .5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;

function cloneNode(node: MathVisualNode, initiallyVisible = true): RuntimeNodeState {
  return { ...node, style: node.style ? { ...node.style } : undefined, opacity: initiallyVisible ? 1 : 0, scale: 1, highlighted: false };
}
function nodeAt(nodes: Map<string, RuntimeNodeState>, id?: string) { return id ? nodes.get(id) : undefined; }
function applyEvent(nodes: Map<string, RuntimeNodeState>, event: MathVisualEvent, progress: number) {
  const t = easeInOut(clamp(progress));
  const target = nodeAt(nodes, event.targetId);
  if (!target) return;
  const from = event.fromObjectId ? nodeAt(nodes, event.fromObjectId) : undefined;
  const to = event.toObjectId ? nodeAt(nodes, event.toObjectId) : target;
  if (event.kind === 'erase') { target.opacity = 1-t; return; }
  if (event.kind === 'move') {
    const fx = event.fromX ?? target.x ?? 0, fy = event.fromY ?? target.y ?? 0;
    target.x = lerp(fx, event.toX ?? fx, t); target.y = lerp(fy, event.toY ?? fy, t);
    return;
  }
  if (event.kind === 'highlight') { target.highlighted = progress > 0 && progress < 1; return; }
  if (event.kind === 'transform') {
    if (from && to && from.id !== to.id) {
      const fx=from.x??0, fy=from.y??0, tx=to.x??fx, ty=to.y??fy;
      target.x=lerp(fx,tx,t); target.y=lerp(fy,ty,t);
      target.width=lerp(from.width??0,to.width??from.width??0,t);
      target.height=lerp(from.height??0,to.height??from.height??0,t);
      target.opacity=lerp(1, to.opacity ?? 1, t);
      if ((event as any).retainFrom === false && from.id !== to.id) from.opacity = 1 - t;
    }
    return;
  }
  if (event.kind === 'draw') {
    target.opacity = t;
    if (target.kind === 'line' || target.kind === 'arrow') {
      const sx=target.startX??target.x??0, sy=target.startY??target.y??0;
      const ex=target.endX??sx, ey=target.endY??sy;
      target.endX=lerp(sx,ex,t); target.endY=lerp(sy,ey,t);
    }
  }
}

export function createRuntimeSnapshot(scene: UniversalMathScene, timeMs=0): RuntimeSnapshot {
  const firstEventByTarget = new Map<string, MathVisualEvent>();
  for (const event of [...scene.events].sort((a, b) => a.atMs - b.atMs)) {
    if (event.targetId && !firstEventByTarget.has(event.targetId)) firstEventByTarget.set(event.targetId, event);
  }
  const nodes = new Map(scene.nodes.map(n => {
    const first = firstEventByTarget.get(n.id);
    const hiddenUntilDraw = first?.kind === 'draw' || (first?.kind === 'transform' && first.fromObjectId && first.fromObjectId !== n.id);
    return [n.id, cloneNode(n, !hiddenUntilDraw)];
  }));
  const camera: RuntimeCamera = { x: 0, y: 0, scale: 1 };
  const events = [...scene.events].sort((a,b)=>a.atMs-b.atMs);
  const activeEventIds:string[]=[];
  for (const event of events) {
    if (timeMs < event.atMs) break;
    const elapsed = Math.max(0, timeMs-event.atMs);
    const p = event.durationMs <= 0 ? 1 : clamp(elapsed/event.durationMs);
    if (p < 1) activeEventIds.push(event.id);
    applyEvent(nodes,event,p);
    if (event.camera && p > 0) {
      const t=easeInOut(p);
      const targetNode = nodeAt(nodes, event.targetId);
      const targetX = event.camera.x ?? (targetNode ? (targetNode.x ?? 0) + (targetNode.width ?? 0) / 2 : undefined);
      const targetY = event.camera.y ?? (targetNode ? (targetNode.y ?? 0) + (targetNode.height ?? 0) / 2 : undefined);
      const targetScale = event.camera.scale ?? (event.camera.action === 'zoom' || event.camera.action === 'focus' ? 1.35 : undefined);
      if (targetScale !== undefined) camera.scale=lerp(camera.scale,targetScale,t);
      if (targetX !== undefined) camera.x=lerp(camera.x,targetX,t);
      if (targetY !== undefined) camera.y=lerp(camera.y,targetY,t);
    }
  }
  return { timeMs, nodes, camera, activeEventIds };
}

export function sceneDurationMs(scene: UniversalMathScene): number {
  return scene.events.reduce((max,e)=>Math.max(max,e.atMs+Math.max(0,e.durationMs)),0);
}

export function eventsForBeat(scene: UniversalMathScene, beatId: string) {
  return scene.events.filter(e=>e.sourceBeatId===beatId).sort((a,b)=>a.atMs-b.atMs);
}
