'use client';
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, FileText, Loader2, Sparkles, Upload, LibraryBig } from 'lucide-react';
import Link from 'next/link';
import { AiGuruTopNav } from '@/components/ai-guru/AiGuruTopNav';
import { studentKey, orderedUsableKeys } from '@/lib/student-key';
import { getProvider, hasUsableFallbackProvider, activeFallbackProviders } from '@/lib/ai-guru/byok-providers';
import { generateMaterial } from '@/lib/ai-guru/material-studio/pipeline';
import type { IndexedDocument, MaterialType, StudyMaterial } from '@/lib/ai-guru/material-studio/types';
import { MATERIAL_TYPES } from '@/lib/ai-guru/material-studio/types';

const labels:Record<MaterialType,string>={mcq:'MCQ',qa:'Q & A','revision-notes':'Revision Notes',flashcards:'Flashcards',worksheet:'Worksheet','question-paper':'Question Paper',ppt:'PPT','mind-map':'Mind Map','whiteboard-notes':'Whiteboard Notes','knowledge-base':'Knowledge Base','problems-formulae':'Problems and Formulae'};
const SUBJECTS=['Mathematics','Physics','Chemistry','Biology','Science','English','Social Science','Computer Science'];
const SYLLABI=[['cbse','CBSE'],['kerala','Kerala State'],['tamilnadu','Tamil Nadu'],['karnataka','Karnataka']];
const LANGUAGES=[['english','English'],['malayalam','Malayalam'],['tamil','Tamil'],['hindi','Hindi']];

function textContentWithLayout(content:any):string{
 let text=''; let previousY:number|undefined; let previousHeight=10;
 for(const item of content.items as any[]){if(!('str' in item)||!item.str)continue;const y=Number(item.transform?.[5]);const height=Math.max(1,Number(item.height||previousHeight||10));if(previousY!==undefined&&Number.isFinite(y)){const gap=Math.abs(y-previousY);if(gap>Math.max(previousHeight,height)*1.7)text+='\n\n';else if(gap>Math.max(previousHeight,height)*.55)text+='\n';else if(text&&!/[\s\n]$/.test(text))text+=' ';}else if(text&&!/[\s\n]$/.test(text))text+=' ';text+=String(item.str);if(item.hasEOL)text+='\n';if(Number.isFinite(y))previousY=y;previousHeight=height;}
 return text.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

// pdfjs-dist REQUIRES GlobalWorkerOptions.workerSrc to be set before
// getDocument() is called — without it, getDocument() throws immediately
// with 'No "GlobalWorkerOptions.workerSrc" specified.' before reading a
// single page. `disableWorker` (used previously) is not a real pdfjs-dist
// option — it was silently ignored, so every upload failed at the very
// first step, before progress ever advanced past its initial 2%, and the
// real error was then swallowed by the UI (see the error-display fix below).
// Exact version pin matches package.json's pdfjs-dist so the worker build
// always matches the API build loaded in the browser.
const PDFJS_VERSION='4.8.69';
const PDFJS_CDN_WORKER=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
function configurePdfWorker(pdfjs:any,useCdn=false){
 if(useCdn){pdfjs.GlobalWorkerOptions.workerSrc=PDFJS_CDN_WORKER;return;}
 if(pdfjs.GlobalWorkerOptions.workerSrc)return;
 try{
  // The bundler-recommended pattern: Next.js/webpack/Turbopack statically
  // detect this literal `new URL(..., import.meta.url)` call and bundle the
  // worker file as a served asset, so PDFs are read fully offline.
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
 }catch{
  pdfjs.GlobalWorkerOptions.workerSrc=PDFJS_CDN_WORKER;
 }
}
async function openPdf(pdfjs:any,data:ArrayBuffer){
 configurePdfWorker(pdfjs);
 try{
  return await pdfjs.getDocument({data:data.slice(0)}).promise;
 }catch(e){
  // If the bundler couldn't resolve/serve the local worker asset (a real,
  // observed failure mode across different Next.js build setups), retry
  // once against the pinned CDN build before giving up.
  if(pdfjs.GlobalWorkerOptions.workerSrc===PDFJS_CDN_WORKER)throw e;
  configurePdfWorker(pdfjs,true);
  return await pdfjs.getDocument({data:data.slice(0)}).promise;
 }
}
async function extractPdfPages(file:File,onProgress:(info:{page:number;total:number;message:string})=>void){
 const pdfjs:any=await import('pdfjs-dist');
 const data=await file.arrayBuffer();
 const pdf=await openPdf(pdfjs,data);
 const pages:{page:number;text:string}[]=[];
 for(let page=1;page<=pdf.numPages;page++){onProgress({page,total:pdf.numPages,message:`Reading page ${page} of ${pdf.numPages}…`});const p=await pdf.getPage(page);const c=await p.getTextContent();pages.push({page,text:textContentWithLayout(c)});}
 const readable=pages.reduce((n,p)=>n+p.text.length,0);
 if(readable<Math.max(100,pdf.numPages*20)) throw new Error('This PDF appears to be scanned/image-only (no extractable text layer). Use an OCR-enabled PDF, or run it through an OCR tool first, then upload the result.');
 return pages;
}
/** A short, actionable next step under the raw error, so "what happened" is
 *  never left as "what do I do about it". */
function explainUploadError(message:string):string{
 const m=message.toLowerCase();
 if(m.includes('workersrc')||m.includes('worker'))return 'The PDF reader engine failed to load in this browser. Try again — if it keeps happening, check that your network/firewall allows loading scripts from cdn.jsdelivr.net.';
 if(m.includes('scanned')||m.includes('ocr'))return 'This file has no selectable text layer (it is likely scanned pages/images). Run it through an OCR tool (e.g. Adobe Acrobat, Google Drive OCR) and upload the OCR\u2019d PDF instead.';
 if(m.includes('invalid pdf')||m.includes('corrupt'))return 'The file may be corrupted or not a real PDF. Try re-exporting or re-downloading it, then upload again.';
 if(m.includes('gemini')||m.includes('byok')||m.includes('api key'))return 'Open Settings \u2192 Gemini BYOK and confirm at least one key shows \u201cActive\u201d, then try uploading again.';
 if(m.includes('indexing failed')||m.includes('json'))return 'AI Guru could not finish understanding this textbook on this attempt. This is often temporary \u2014 try again in a moment.';
 return 'Try selecting the PDF again. If this keeps happening on this file, try a different export of the same PDF.';
}

export default function MaterialStudio(){
 const [doc,setDoc]=useState<IndexedDocument|null>(null),[materials,setMaterials]=useState<StudyMaterial[]>([]),[selected,setSelected]=useState<StudyMaterial|null>(null);
 const [subject,setSubject]=useState(''),[grade,setGrade]=useState(''),[syllabus,setSyllabus]=useState(''),[sourceLanguage,setSourceLanguage]=useState(''),[teachingLanguage,setTeachingLanguage]=useState('');
 const [chapterId,setChapterId]=useState('all'),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [byok,setByok]=useState(false),[byokMasked,setByokMasked]=useState<string|null>(null);
 const [fallbackReady,setFallbackReady]=useState(false),[activeFallback,setActiveFallback]=useState<string[]>([]);
 const [progress,setProgress]=useState(0),[progressPage,setProgressPage]=useState(0),[progressTotal,setProgressTotal]=useState(0),[progressStage,setProgressStage]=useState('idle');
 const [batch,setBatch]=useState<Record<string,{state:'pending'|'running'|'done'|'failed';detail?:string}>>({});
 const [activeMaterialType,setActiveMaterialType]=useState<MaterialType|null>(null);
 const [batchRunning,setBatchRunning]=useState(false);
 const ready=Boolean(subject&&grade&&syllabus&&sourceLanguage&&teachingLanguage);
 const canCreate=Boolean(doc&&!busy); // Keep material tabs clickable once a textbook is loaded. BYOK is validated on click so the UI can explain what is missing instead of looking broken/inactive.
 useEffect(()=>{const id=localStorage.getItem('ai-guru:material-document');if(id)void load(id); const sync=()=>{
   const geminiReady=studentKey.hasValidatedKey();
   const fallbacks=['agnes','sarvam'].filter((p:any)=>Boolean(getProvider(p as any)?.key));
   setByok(geminiReady);
   setByokMasked(studentKey.masked(studentKey.getSaved()||undefined));
   setFallbackReady(hasUsableFallbackProvider());
   setActiveFallback(fallbacks);
  }; sync(); window.addEventListener('gemini-key-pool-changed',sync); window.addEventListener('ai-guru-byok-providers-changed',sync); return()=>{window.removeEventListener('gemini-key-pool-changed',sync);window.removeEventListener('ai-guru-byok-providers-changed',sync)}},[]);
 async function load(id:string){try{const [d,m]=await Promise.all([fetch(`/api/ai-guru/material-studio/sources/${encodeURIComponent(id)}`).then(r=>r.json()),fetch(`/api/ai-guru/material-studio/materials?documentId=${encodeURIComponent(id)}`).then(r=>r.json())]);if(d.ok){setDoc(d.document);setSubject(d.document.subject||'');setGrade(d.document.grade||'');setSyllabus(d.document.syllabus||'');setSourceLanguage(d.document.sourceLanguage||'');setTeachingLanguage(d.document.teachingLanguage||'');}if(m.ok){const loaded=m.materials||[];setMaterials(loaded);setBatch(Object.fromEntries(MATERIAL_TYPES.map(type=>{const made=loaded.some((x:StudyMaterial)=>x.type===type);return [batchKey('all',type),{state:made?'done':'pending'}];})));}}catch{}}
 async function upload(file:File){
  if(!ready){setError('Complete Subject, Class, Syllabus, PDF language and Teaching language before selecting a PDF.');return;}
  setBusy(true);setError('');setSelected(null);setActiveMaterialType(null);setBatch({});setProgress(2);setProgressPage(0);setProgressTotal(0);setProgressStage('reading');setStatus('Opening the PDF and preparing the complete-book read…');
  try{
   const pages=await extractPdfPages(file,(info)=>{setProgressTotal(info.total);setProgressPage(info.page);setProgress(Math.max(3,Math.round((info.page/info.total)*62)));setProgressStage('reading');setStatus(info.message);});
   setProgress(65);setProgressPage(pages.length);setProgressTotal(pages.length);setProgressStage('indexing');setStatus(`All ${pages.length} pages read. Building the paragraph/source index…`);
   const form=new FormData(); form.append('file',file); form.append('pages',JSON.stringify(pages)); form.append('geminiKey',studentKey.get()||'');
   form.append('agnesApiKey',getProvider('agnes')?.key||'');
   form.append('sarvamApiKey',getProvider('sarvam')?.key||''); form.append('subject',subject); form.append('grade',grade); form.append('syllabus',syllabus); form.append('sourceLanguage',sourceLanguage); form.append('teachingLanguage',teachingLanguage);
   setProgress(70);setProgressStage('understanding');setStatus('Complete book read finished. AI Guru is identifying chapters and understanding the textbook structure…');
   const r=await fetch('/api/ai-guru/material-studio/index',{method:'POST',body:form});
   setProgress(94);setProgressStage('saving');setStatus('Chapter map complete. Saving the indexed textbook and page-to-paragraph map…');
   const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Indexing failed');
   setDoc(j.document);localStorage.setItem('ai-guru:material-document',j.document.id);setMaterials([]);setChapterId('all');setProgress(100);setProgressPage(j.document.pageCount);setProgressTotal(j.document.pageCount);setProgressStage('complete');setStatus(`Book understood and indexed: ${j.document.pageCount} pages · ${j.document.chapters.length} chapters · ${j.document.sources.length} paragraph units. Ready.`);
  }catch(e){setProgressStage('error');setError(e instanceof Error?e.message:'PDF upload/indexing failed');setStatus('');}finally{setBusy(false)}
 }
 /** Every Gemini call inside generateMaterial() rotates across the saved BYOK
  *  key pool, so this only has to check that at least one key is usable. */
 function byokGate(){
  const usable=orderedUsableKeys();
  const fallbackReady=hasUsableFallbackProvider();
  const fallbacks=activeFallbackProviders();
  setByok(Boolean(usable.length));
  setFallbackReady(fallbackReady);
  setActiveFallback(fallbacks);
  if(usable.length){
   // The key pool can be changed in Settings while Material Studio remains mounted.
   // Re-sync here so a valid key never leaves the material tabs looking inactive.
   setByokMasked(studentKey.masked(studentKey.getSaved()||undefined));
   return true;
  }
  if(fallbackReady){
   setByokMasked('');
   return true;
  }
  setError('No AI provider is active. Open Settings → Gemini BYOK and save/validate a Gemini key, Agnes AI key, or Sarvam AI key.');
  return false;
 }
 const batchKey=(cid:string,type:MaterialType)=>`${cid}::${type}`;
 async function generateOne(type:MaterialType,forChapterId:string=chapterId){
  if(!doc) throw new Error('No indexed textbook is loaded.');
  const material=await generateMaterial(doc.id,type,doc.sources,teachingLanguage,undefined,forChapterId,doc.chapters||[]);
  // Allow high-scoring materials through even if marked needs_review (bilingual soft flags).
  if(material.qa.status==='failed'||(material.qa.status!=='passed'&&material.qa.status!=='needs_review')||(material.qa.status==='needs_review'&&Number(material.qa.score||0)<70))throw new Error(`QA gate not passed (${material.qa.status}, ${material.qa.score}/100). ${material.qa.issues?.slice(0,3).join(' ')||''}`);
  if(material.qa.status==='needs_review')console.info('[material-studio] saved with needs_review', material.qa);
  const save=await fetch('/api/ai-guru/material-studio/materials',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({material})});
  const j=await save.json();
  if(!save.ok||!j.ok)throw new Error(j.error||'Material save failed');
  setMaterials(prev=>[j.material,...prev.filter((x:StudyMaterial)=>x.id!==j.material.id)]);
  return j.material as StudyMaterial;
 }
 async function create(type:MaterialType){
  if(!doc||!byokGate())return;
  setActiveMaterialType(type);
  const key=batchKey(chapterId,type);
  setBusy(true);setError('');setBatch(b=>({...b,[key]:{state:'running'}}));
  setStatus(`Creating ${labels[type]} · ${chapterLabel} with AI provider chain (Gemini → Agnes → Sarvam)…`);
  try{
   const material=await generateOne(type,chapterId);
   setSelected(material);
   setBatch(b=>({...b,[key]:{state:'done'}}));
   setStatus(`${labels[type]} created with AI provider chain · QA ${material.qa.status} · ${material.qa.score}/100`);
  }catch(e){
   const detail=e instanceof Error?e.message:'Generation failed';
   setBatch(b=>({...b,[key]:{state:'failed',detail}}));
   setError(detail);
  }finally{setBusy(false)}
 }
 /** Creates the full study-material pack.
  *
  *  When "Whole textbook" is selected AND the textbook has a real AI Guru
  *  chapter map, this runs one CHAPTER-SCOPED pass per material type instead
  *  of one whole-book pass. Whole-book context on a large textbook runs tens
  *  of thousands of tokens per call across several calls per material type;
  *  a chapter is a fraction of that, so quality stays grounded instead of
  *  drifting, and the many small chapter x type tasks are exactly what the
  *  multi-key BYOK pool is good at parallelising. Each (chapter, type) pair
  *  is saved as its own separate, browsable material ("Ch.1 Worksheet",
  *  "Ch.2 Worksheet", ...) rather than one material stitched across chapters.
  *
  *  Selecting one specific chapter keeps the previous single-scope
  *  behaviour: one material per type, scoped to that chapter only.
  */
 async function createAll(){
  if(!doc||!byokGate())return;
  const types=[...MATERIAL_TYPES];
  const perChapter=chapterId==='all'&&(doc.chapters||[]).length>0;
  const chapterTargets=perChapter?doc.chapters:[{id:chapterId,title:chapterLabel} as any];
  const tasks=chapterTargets.flatMap(c=>types.map(type=>({chapterId:c.id,chapterTitle:c.title,type})));
  const lanes=Math.max(1,Math.min(perChapter?4:3,orderedUsableKeys().length));
  setBusy(true);setBatchRunning(true);setError('');
  setBatch(Object.fromEntries(tasks.map(t=>[batchKey(t.chapterId,t.type),{state:'pending' as const}])));
  let done=0,failed=0;
  const queue=[...tasks];
  const worker=async()=>{
   for(;;){
    const task=queue.shift();
    if(!task)return;
    setBatch(b=>({...b,[batchKey(task.chapterId,task.type)]:{state:'running'}}));
    setStatus(perChapter
     ?`Creating ${labels[task.type]} \u00b7 ${task.chapterTitle}\u2026 (${done+failed}/${tasks.length} finished)`
     :`Creating ${labels[task.type]}\u2026 (${done+failed}/${tasks.length} finished)`);
    try{
     const material=await generateOne(task.type,task.chapterId);
     done++;setBatch(b=>({...b,[batchKey(task.chapterId,task.type)]:{state:'done'}}));setSelected(prev=>prev||material);
    }catch(e){
     failed++;
     const detail=e instanceof Error?e.message:'Generation failed';
     setBatch(b=>({...b,[batchKey(task.chapterId,task.type)]:{state:'failed',detail}}));
    }
   }
  };
  try{
   await Promise.all(Array.from({length:lanes},()=>worker()));
   setStatus(`Study-material pack finished \u00b7 ${done} created${failed?` \u00b7 ${failed} failed (see the per-chapter progress below)`:''}`);
   if(failed&&!done)setError('Every material failed. Check the per-material messages below \u2014 the most common causes are an exhausted Gemini key pool or a chapter with too little readable source text.');
  }finally{setBusy(false);setBatchRunning(false)}
 }
 const chapterLabel=useMemo(()=>chapterId==='all'?'Whole textbook':doc?.chapters.find(c=>c.id===chapterId)?.title||'Selected chapter',[chapterId,doc]);
 const materialMade=(type:MaterialType)=>materials.some(m=>m.type===type&&(chapterId==='all'||(m.chapterIds||[]).includes(chapterId)));
 const createdMaterialCount=useMemo(()=>MATERIAL_TYPES.filter(type=>materialMade(type)).length,[materials,chapterId]);
 const chaptersInBatch=useMemo(()=>[...new Set(Object.keys(batch).map(k=>k.split('::')[0]))],[batch]);
 async function retryChapterType(cid:string,type:MaterialType){
  if(!doc||!byokGate())return;
  const key=batchKey(cid,type);
  setBusy(true);setError('');setBatch(b=>({...b,[key]:{state:'running'}}));
  try{
   await generateOne(type,cid);
   setBatch(b=>({...b,[key]:{state:'done'}}));
  }catch(e){
   setBatch(b=>({...b,[key]:{state:'failed',detail:e instanceof Error?e.message:'Generation failed'}}));
  }finally{setBusy(false)}
 }
 return <main className="min-h-screen bg-[#070a0f] text-white" style={{fontFamily:'Noto Sans, Chilanka, Noto Sans Malayalam, Nirmala UI, sans-serif'}}>
  <AiGuruTopNav activeLabel="Material Studio" />
  {/* Global classroom navigation is kept on every AI Guru workspace page so
      Material Studio never becomes a dead-end. */}
  <nav className="sticky top-0 z-40 flex items-center gap-1 overflow-x-auto border-b border-cyan-300/10 bg-[#061321]/95 px-3 py-2 backdrop-blur">
   <Link href="/ai-guru" className="mr-2 flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400">✣</span>AI Guru</Link>
   {[['/ai-guru','Dashboard'],['/ai-guru','Live Class'],['/ai-guru','RAG Classroom'],['/ai-guru/material-studio','Material Studio'],['/ai-guru','My Textbooks'],['/ai-guru','Quizzes & Exams'],['/ai-guru','Flashcards'],['/ai-guru','Whiteboard Lab'],['/ai-guru','Progress'],['/ai-guru','Teacher Portal'],['/ai-guru','Parent Portal'],['/ai-guru','Profile'],['/ai-guru/settings/gemini','Settings'],['/ai-guru','Subscription']].map(([href,label])=><Link key={label} href={href} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${label==='Material Studio'?'bg-violet-600 text-white':'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}>{label}</Link>)}
  </nav>
  <div className="border-b border-cyan-300/10 bg-[#091725] px-4 py-2">
   <div className="mx-auto flex max-w-7xl items-center justify-end gap-2">
    <Link href="/ai-guru/settings/gemini" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${byok?'border-emerald-300/25 bg-emerald-300/10 text-emerald-100':'border-amber-300/20 bg-amber-300/10 text-amber-100'}`}>{byok?'✓ Gemini BYOK Active':'Gemini BYOK'}</Link>
    <label className={`rounded-lg px-3 py-2 text-xs font-semibold ${ready&&!busy?'cursor-pointer bg-cyan-300 text-black':'cursor-not-allowed bg-white/10 text-white/35'}`}><Upload className="mr-1 inline" size={14}/> {doc?'Replace PDF':'Choose PDF'}<input type="file" accept="application/pdf" className="hidden" disabled={!ready||busy} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>e.target.files?.[0]&&void upload(e.target.files[0])}/></label>
   </div>
  </div>
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><div><Link href="/ai-guru" className="text-xs text-white/45"><ArrowLeft className="mr-1 inline" size={14}/> Back to RAG Classroom</Link><h1 className="mt-2 text-2xl font-semibold">Material Studio</h1><p className="text-sm text-white/45">Understand the textbook once · create grounded materials without changing the AI Guru classroom</p></div></header>
  <section className="mx-auto max-w-7xl py-5"><div className="rounded-2xl border border-white/10 bg-[#10141b] p-5"><div className="flex items-start gap-3"><LibraryBig className="mt-1 text-cyan-300" size={22}/><div><h2 className="text-lg font-semibold">Tell AI Guru about this textbook first</h2><p className="mt-1 text-sm text-white/45">These choices control indexing, chapter understanding, teaching language and every material generated from this PDF. The PDF cannot be selected until all five are answered.</p></div></div>
   <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
    <Field label="Subject" value={subject} set={setSubject} options={SUBJECTS.map(x=>[x,x])}/><Field label="Class" value={grade} set={setGrade} options={Array.from({length:12},(_,i)=>[String(i+1),`Class ${i+1}`])}/><Field label="Syllabus" value={syllabus} set={setSyllabus} options={SYLLABI}/><Field label="PDF language" value={sourceLanguage} set={setSourceLanguage} options={LANGUAGES}/><Field label="Teach me in" value={teachingLanguage} set={setTeachingLanguage} options={LANGUAGES}/>
   </div>
   <div className={`mt-4 rounded-xl border p-3 text-sm ${ready?'border-cyan-300/20 bg-cyan-300/5 text-cyan-100':'border-white/10 bg-black/20 text-white/45'}`}>{ready?<><CheckCircle2 className="mr-2 inline" size={16}/>Ready. Study materials will contain English plus <b>{LANGUAGES.find(x=>x[0]===teachingLanguage)?.[1]||teachingLanguage}</b>. Teaching follows the two-pass paragraph method.</>:<>Complete all five selections to unlock PDF upload.</>}</div>
  <div className={`mt-3 rounded-xl border p-3 text-sm ${(byok||fallbackReady)?'border-emerald-300/20 bg-emerald-300/5 text-emerald-100':'border-amber-300/20 bg-amber-300/5 text-amber-100'}`}>{(byok||fallbackReady)?<><CheckCircle2 className="mr-2 inline" size={16}/>{byok?'Gemini BYOK ready.':'Gemini is inactive; fallback AI is ready.'} {fallbackReady&&<span className="text-emerald-200/80">Fallback: {activeFallback.join(' → ')}.</span>} Material creation uses Gemini first, then Agnes AI, then Sarvam AI.</>:<>No AI provider is active. <Link href="/ai-guru/settings/gemini" className="underline">Open BYOK Settings</Link> and connect Gemini, Agnes AI, or Sarvam AI before creating study materials.</>}</div></div></section>
  {(busy || progressStage==='complete' || progressStage==='error') && <section className="mx-auto max-w-7xl pb-5" aria-live="polite">
    <div className={`rounded-2xl border p-5 ${progressStage==='error' ? 'border-red-400/30 bg-red-950/20' : progressStage==='complete' ? 'border-emerald-300/20 bg-emerald-300/5' : 'border-cyan-300/20 bg-[#101a20]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {busy ? <Loader2 className="animate-spin text-cyan-300" size={22}/> : progressStage==='complete' ? <CheckCircle2 className="text-emerald-300" size={22}/> : <FileText className="text-red-300" size={22}/>} 
            <div>
              <h2 className="text-lg font-semibold">{busy ? 'AI Guru is processing your textbook' : progressStage==='complete' ? 'Textbook processing complete' : 'Textbook processing stopped'}</h2>
              <p className="mt-1 text-sm text-white/50">{status || (progressStage==='complete' ? 'The complete book is indexed and ready for study-material creation.' : 'Please correct the error and choose the PDF again.')}</p>
            </div>
          </div>
        </div>
        <div className="min-w-[190px] text-right">
          <div className="text-2xl font-bold text-cyan-200">{progress}%</div>
          <div className="text-xs text-white/40">overall progress</div>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className={`h-full rounded-full transition-all duration-300 ${progressStage==='complete' ? 'bg-emerald-300' : progressStage==='error' ? 'bg-red-400' : 'bg-cyan-300'}`} style={{width:`${progress}%`}} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className={`rounded-lg px-3 py-2 ${progressStage==='reading'?'bg-cyan-300/10 text-cyan-100':'bg-white/5 text-white/45'}`}><b>1. Read PDF</b>{progressTotal ? <span className="ml-2 font-mono">Page {progressPage} / {progressTotal}</span> : null}</div>
        <div className={`rounded-lg px-3 py-2 ${progressStage==='indexing'?'bg-cyan-300/10 text-cyan-100':'bg-white/5 text-white/45'}`}><b>2. Index paragraphs</b></div>
        <div className={`rounded-lg px-3 py-2 ${progressStage==='understanding'?'bg-cyan-300/10 text-cyan-100':'bg-white/5 text-white/45'}`}><b>3. Understand chapters</b></div>
        <div className={`rounded-lg px-3 py-2 ${progressStage==='saving'?'bg-cyan-300/10 text-cyan-100':'bg-white/5 text-white/45'}`}><b>4. Save textbook</b></div>
      </div>
      {progressStage==='reading' && progressTotal>0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45"><span>Reading every page before AI Guru builds the chapter map.</span><span className="font-mono text-cyan-200">{progressPage} of {progressTotal} pages · {Math.round((progressPage/progressTotal)*100)}%</span></div>}
      {progressStage==='complete' && doc && <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/5 px-3 py-2 text-sm text-emerald-100"><b>{doc.fileName}</b> · {doc.pageCount} pages · {doc.chapters.length} chapters · {doc.sources.length} paragraph units. All materials will reuse this index.</div>}
      {/* This used to only be shown inside the {doc && ...} panel further down
          the page, which never renders when upload/indexing fails BEFORE a
          document exists — so a failed upload showed the generic fallback
          text above and nothing else. This is the actual thrown error text
          plus a concrete next step, and it is not gated on `doc`. */}
      {progressStage==='error' && error && <div className="mt-3 space-y-2">
        <div role="alert" className="rounded-xl border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100"><b>What went wrong: </b>{error}</div>
        <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 p-3 text-sm text-amber-100"><b>What to do: </b>{explainUploadError(error)}</div>
      </div>}
    </div>
  </section>}
  {doc&&<div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[300px_1fr]">
   <aside className="rounded-2xl border border-white/10 bg-[#10141b] p-4"><div className="text-xs uppercase tracking-[.2em] text-white/35">Indexed Textbook</div><h2 className="mt-2 font-semibold">{doc.fileName}</h2><div className="mt-1 text-xs text-white/45">{doc.pageCount} pages · {doc.sources.length} paragraph units</div><div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs text-cyan-100"><CheckCircle2 className="mr-1 inline" size={14}/> Complete-book understanding saved. All materials reuse this index.</div><label className="mt-5 block text-xs text-white/45">Create for</label><select value={chapterId} style={{colorScheme:'dark'}} onChange={e=>setChapterId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#161c26] p-2.5 text-sm text-white outline-none focus:border-cyan-300"><option className="bg-[#161c26] text-white" value="all">Whole textbook</option>{doc.chapters.map(c=><option className="bg-[#161c26] text-white" key={c.id} value={c.id}>{c.title} · pp. {c.startPage}–{c.endPage}</option>)}</select><button type="button" disabled={!canCreate} onClick={()=>void createAll()} title={!(byok||fallbackReady)?'Connect Gemini, Agnes AI, or Sarvam AI before generation':'Create the complete material pack'} className="mt-4 w-full rounded-xl bg-cyan-300 px-3 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35">{batchRunning?<><Loader2 className="mr-2 inline animate-spin" size={15}/>Creating all {MATERIAL_TYPES.length} materials…</>:<><Sparkles className="mr-2 inline" size={15}/>Create all {MATERIAL_TYPES.length} study materials</>}</button>
   <div className="mt-2 text-[11px] text-white/35">Or create one at a time. Each material is QA-checked before it is saved.</div>
   <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-semibold text-white/65">Material creation tabs</div><div className="mt-1 text-[11px] text-white/35">Green = already created · Violet = selected/creating · Dark = remaining</div></div><div className="text-xs font-mono text-white/45">{createdMaterialCount}/{MATERIAL_TYPES.length} created</div></div>
    <div className="mt-3 flex flex-wrap gap-2">{MATERIAL_TYPES.map(type=>{const st=batch[batchKey(chapterId,type)]?.state;const made=materialMade(type)||st==='done';const active=activeMaterialType===type;return <button key={type} disabled={!canCreate} onClick={()=>void create(type)} title={batch[batchKey(chapterId,type)]?.detail||(!byok?'Click to connect/validate Gemini BYOK before generation':`Create ${labels[type]}`)} className={`rounded-xl border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${st==='failed'?'border-red-400/40 bg-red-950/25 text-red-100':made?'border-emerald-300/35 bg-emerald-300/15 text-emerald-100':active||st==='running'?'border-violet-400/60 bg-violet-600/30 text-white shadow-[0_0_18px_rgba(124,58,237,.22)]':'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10 hover:text-white'}`}>{st==='running'?<Loader2 className="mr-1 inline animate-spin" size={13}/>:made?<CheckCircle2 className="mr-1 inline" size={13}/>:<Sparkles className="mr-1 inline" size={13}/>} {labels[type]}{st==='failed'&&<span className="ml-1 opacity-80">· Retry</span>}</button>})}</div>
   </div>
   {chaptersInBatch.length>1&&<div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
    <div className="text-xs font-semibold text-white/60">Per-chapter progress</div>
    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">{chaptersInBatch.map(cid=>{
     const chTitle=doc.chapters.find(c=>c.id===cid)?.title||cid;
     const rows=MATERIAL_TYPES.map(type=>({type,st:batch[batchKey(cid,type)]?.state}));
     const done=rows.filter(r=>r.st==='done').length,failed=rows.filter(r=>r.st==='failed').length,running=rows.filter(r=>r.st==='running').length;
     return <div key={cid} className="rounded-lg border border-white/10 bg-white/5 p-2">
      <div className="flex items-center justify-between gap-2 text-[11px]"><span className="truncate text-white/70">{chTitle}</span><span className={failed?'text-red-200':running?'text-cyan-200':done===MATERIAL_TYPES.length?'text-emerald-200':'text-white/40'}>{done}/{MATERIAL_TYPES.length}{failed?` · ${failed} failed`:''}</span></div>
      <div className="mt-1.5 flex flex-wrap gap-1">{rows.map(r=><button key={r.type} title={`${labels[r.type]}${batch[batchKey(cid,r.type)]?.detail?`: ${batch[batchKey(cid,r.type)]?.detail}`:''}`} onClick={()=>r.st==='failed'&&void retryChapterType(cid,r.type)} className={`h-2 w-4 rounded-full ${r.st==='done'?'bg-emerald-300':r.st==='failed'?'bg-red-400 cursor-pointer':r.st==='running'?'bg-cyan-300 animate-pulse':'bg-white/15'}`}/>)}</div>
     </div>;
    })}</div>
   </div>}
  </aside>
   <section className="min-h-[620px] rounded-2xl border border-white/10 bg-[#10141b] p-4">{busy&&<div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4"><div className="flex items-center justify-between gap-3 text-sm"><div className="flex items-center gap-2"><Loader2 className="animate-spin text-cyan-300" size={17}/><span>{status}</span></div><b className="text-cyan-200">{progress}%</b></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-cyan-300 transition-all duration-300" style={{width:`${progress}%`}}/></div><div className="mt-3 grid grid-cols-4 gap-2 text-[11px]"><div className={progressStage==='reading'?'text-cyan-200':'text-white/40'}>1. Read pages{progressTotal?` · ${progressPage}/${progressTotal}`:''}</div><div className={progressStage==='indexing'?'text-cyan-200':'text-white/40'}>2. Index paragraphs</div><div className={progressStage==='understanding'?'text-cyan-200':'text-white/40'}>3. Understand chapters</div><div className={progressStage==='saving'?'text-cyan-200':'text-white/40'}>4. Save textbook</div></div></div>}{!busy&&status&&<div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">{status}</div>}{error&&<div role="alert" className="mb-4 rounded-xl border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</div>}
    {!materials.length?<div className="flex h-[540px] items-center justify-center text-center text-white/35"><div><BookOpen className="mx-auto mb-3" size={42}/><p>{chapterId==='all'?'Whole textbook selected.':'Chapter selected.'}</p><p className="mt-1 text-xs">Now click a study-material type on the left, such as Whiteboard Notes. Each material is QA-checked before it is saved.</p>{!(byok||fallbackReady)&&<p className="mt-3 text-xs text-amber-200">No AI provider is active. Connect Gemini, Agnes AI, or Sarvam AI in BYOK Settings.</p>}</div></div>:<div><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Created Materials</h2><p className="text-xs text-white/40">{chapterLabel} · English + {LANGUAGES.find(x=>x[0]===doc.teachingLanguage)?.[1]||doc.teachingLanguage}</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{materials.map(m=>{const scopedChapter=m.chapterIds?.length===1?doc.chapters.find(c=>c.id===m.chapterIds![0]):undefined;return <button key={m.id} onClick={()=>setSelected(m)} className={`rounded-xl border p-3 text-left ${selected?.id===m.id?'border-cyan-300 bg-cyan-300/10':'border-white/10 bg-white/5'}`}><div className="font-medium">{scopedChapter?`${scopedChapter.title} — `:''}{m.title}</div><div className="mt-1 text-xs text-white/45">{labels[m.type]} · QA {m.qa.score}/100 · {m.sections.length} units</div></button>;})}</div>{selected&&<article className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{selected.title}</h3><div className="text-xs text-white/40">QA {selected.qa.status} · {selected.qa.score}/100 · {selected.materialLanguages.join(' + ')}</div></div><Link href={`/ai-guru?materialDocument=${encodeURIComponent(selected.documentId)}&material=${encodeURIComponent(selected.id)}`} className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-semibold text-black">Teach in Classroom</Link></div><p className="mt-3 text-sm text-white/70">{selected.overview}</p><div className="mt-4 space-y-3">{selected.sections.slice(0,8).map(s=><div key={s.id} className="rounded-xl border border-white/10 p-3"><b>{s.heading}</b>{s.teachingPass&&<><p className="mt-2 text-xs text-white/40">Source paragraph</p><p className="text-sm text-white/60">{s.teachingPass.sourceText}</p><p className="mt-2 text-xs text-cyan-200">English explanation</p><p className="text-sm text-white/70">{s.teachingPass.englishExplanation}</p><p className="mt-2 text-xs text-cyan-200">{doc.teachingLanguage} explanation</p><p className="text-sm text-white/70">{s.teachingPass.translatedExplanation}</p></>}</div>)}</div></article>}</div>}
   </section></div>}
 </main>
}
// The native dropdown popup is painted by the OS/browser, not by the page, so a
// translucent Tailwind background (bg-white/5) resolved against the popup's own
// white surface while the text kept inheriting the page's white colour — which is
// why the open list looked blank. Both the closed control and every <option> now
// carry a solid dark background and an explicit light text colour.
function Field({label,value,set,options}:{label:string;value:string;set:(v:string)=>void;options:string[][]}){return <label className="space-y-1"><span className="text-xs font-semibold text-white/55">{label}</span><select value={value} style={{colorScheme:'dark'}} onChange={e=>set(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#161c26] p-3 text-sm text-white outline-none focus:border-cyan-300"><option className="bg-[#161c26] text-white" value="">Select {label.toLowerCase()}</option>{options.map(([id,text])=><option className="bg-[#161c26] text-white" key={id} value={id}>{text}</option>)}</select></label>}
