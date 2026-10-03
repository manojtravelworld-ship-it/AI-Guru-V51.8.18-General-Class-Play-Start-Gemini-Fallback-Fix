import { NextResponse } from 'next/server';
import { getDocumentPdf } from '@/lib/ai-guru/material-studio/store';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const pdf=await getDocumentPdf(id);if(!pdf)return NextResponse.json({error:'PDF not found'},{status:404});return new Response(pdf,{headers:{'content-type':'application/pdf','cache-control':'private, max-age=3600'}});}
