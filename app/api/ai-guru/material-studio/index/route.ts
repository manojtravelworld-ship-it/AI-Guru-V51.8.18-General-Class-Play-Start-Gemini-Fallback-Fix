import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { indexPdf } from '@/lib/ai-guru/material-studio/index-pdf';
import { understandBook } from '@/lib/ai-guru/material-studio/book-understanding';
import { saveDocument } from '@/lib/ai-guru/material-studio/store';
export const runtime='nodejs';
export async function POST(request:Request){
  try{
    const form=await request.formData();
    const pagesRaw=String(form.get('pages')||'[]');
    const pages=JSON.parse(pagesRaw);
    const subject=String(form.get('subject')||'').trim();
    const grade=String(form.get('grade')||'').trim();
    const syllabus=String(form.get('syllabus')||'').trim();
    const sourceLanguage=String(form.get('sourceLanguage')||'').trim();
    const teachingLanguage=String(form.get('teachingLanguage')||'').trim();
    // BYOK: the browser forwards the student's own Gemini key so chapter
    // understanding works without a server-side GEMINI_API_KEY.
    const geminiKey=String(form.get('geminiKey')||'').trim()||undefined;
    const agnesApiKey=String(form.get('agnesApiKey')||'').trim()||undefined;
    const sarvamApiKey=String(form.get('sarvamApiKey')||'').trim()||undefined;
    const file=form.get('file');
    const fileName=file instanceof File?file.name:'textbook.pdf';
    if(!subject||!grade||!syllabus||!sourceLanguage||!teachingLanguage) return NextResponse.json({ok:false,error:'Subject, class, syllabus, PDF language and teaching language are required before upload.'},{status:400});
    if(!pages.length) return NextResponse.json({ok:false,error:'No readable PDF pages were received.'},{status:400});
    const indexed=indexPdf(pages,fileName);
    const chapters=await understandBook(indexed.sources,{subject,grade,syllabus,sourceLanguage,teachingLanguage},geminiKey,agnesApiKey,sarvamApiKey);
    const chapterBySource=new Map(chapters.flatMap(c=>c.sourceIds.map(id=>[id,c] as const)));
    const sources=indexed.sources.map(s=>{const c=chapterBySource.get(s.id);return c?{...s,chapterId:c.id,chapterTitle:c.title}:s;});
    const id=`doc:${nanoid(12)}`;
    if(!(file instanceof File)) return NextResponse.json({ok:false,error:'The original PDF file is required.'},{status:400});
    const pdfBytes=Buffer.from(await file.arrayBuffer());
    const doc=await saveDocument({id,fileName,mimeType:'application/pdf',pageCount:indexed.pageCount,indexedAt:new Date().toISOString(),parser:indexed.parser,subject,grade,syllabus,sourceLanguage,teachingLanguage,chapters,sources},pdfBytes);
    return NextResponse.json({ok:true,document:doc});
  }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:422});}
}
