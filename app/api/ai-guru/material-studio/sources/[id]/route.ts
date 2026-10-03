import { NextResponse } from 'next/server';
import { getDocument } from '@/lib/ai-guru/material-studio/store';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const doc=await getDocument(id);if(!doc)return NextResponse.json({ok:false,error:'Document not found'},{status:404});return NextResponse.json({ok:true,document:doc});}
