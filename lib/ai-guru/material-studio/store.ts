import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IndexedDocument, StudyMaterial } from './types';

const ROOT = path.join(process.cwd(), '.data', 'ai-guru-material-studio');
const docsDir = path.join(ROOT, 'documents');
const materialsDir = path.join(ROOT, 'materials');
const pdfDir = path.join(ROOT, 'pdf');
async function ensure() { await Promise.all([fs.mkdir(docsDir,{recursive:true}),fs.mkdir(materialsDir,{recursive:true}),fs.mkdir(pdfDir,{recursive:true})]); }
async function readJson<T>(file:string):Promise<T|null>{try{return JSON.parse(await fs.readFile(file,'utf8')) as T}catch{return null}}
export async function saveDocument(doc:IndexedDocument,pdf:Buffer){await ensure();await fs.writeFile(path.join(docsDir,`${doc.id}.json`),JSON.stringify(doc,null,2));await fs.writeFile(path.join(pdfDir,`${doc.id}.pdf`),pdf);return doc}
export async function getDocument(id:string){return readJson<IndexedDocument>(path.join(docsDir,`${id}.json`))}
export async function getDocumentPdf(id:string){await ensure();try{return await fs.readFile(path.join(pdfDir,`${id}.pdf`))}catch{return null}}
export async function saveMaterial(material:StudyMaterial){await ensure();await fs.writeFile(path.join(materialsDir,`${material.id}.json`),JSON.stringify(material,null,2));return material}
export async function getMaterial(id:string){return readJson<StudyMaterial>(path.join(materialsDir,`${id}.json`))}
export async function listMaterials(documentId?:string){await ensure();const files=(await fs.readdir(materialsDir)).filter(x=>x.endsWith('.json'));const items=(await Promise.all(files.map(f=>readJson<StudyMaterial>(path.join(materialsDir,f))))).filter((x):x is StudyMaterial=>!!x);return items.filter(x=>!documentId||x.documentId===documentId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
