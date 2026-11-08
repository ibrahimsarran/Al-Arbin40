import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {sha256} from '../public/vendor/sha256.mjs';
const require=createRequire(import.meta.url);
globalThis.indexedDB=require(process.env.FAKE_IDB_PATH||'fake-indexeddb').indexedDB;
// Start with the real previous schema: upgrading may not destroy personal recordings.
const oldDB=await new Promise((resolve,reject)=>{const req=indexedDB.open('arbaeen-audio',1);req.onupgradeneeded=()=>req.result.createObjectStore('recordings',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
await new Promise((resolve,reject)=>{const tx=oldDB.transaction('recordings','readwrite');tx.objectStore('recordings').put({id:7,name:'my-voice.mp3',file:new Blob(['personal'],{type:'audio/mpeg'})});tx.oncomplete=resolve;tx.onerror=reject;});oldDB.close();
const {AudioRepository}=await import('../public/js/repositories/audio-repository.mjs');const repo=new AudioRepository();
const {downloadKey}=await import('../public/js/utils/audio-key.mjs');
const {AudioDownloadService}=await import('../public/js/services/audio-download-service.mjs');
const service=new AudioDownloadService(repo);
const downloadAudio=(reader,recording,{fetcher,...options}={})=>new AudioDownloadService(repo,fetcher).download(reader,recording,options);
const matchingDownload=(...args)=>service.matches(...args);
const downloadError=error=>service.errorMessage(error);
const body=new TextEncoder().encode('complete human recording fixture');
const recording={id:1,url:'audio/01.mp3',bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')};
const response=()=>new Response(body,{headers:{'Content-Type':'audio/mpeg'}});

test('schema upgrade retains personal audio; voice-specific downloads persist independently',async()=>{
 assert.equal((await repo.audioGetAll())[0].name,'my-voice.mp3');
 let received=0;await downloadAudio('alnufais',recording,{fetcher:async()=>response(),onProgress:n=>received=n});
 await downloadAudio('alhusaini',recording,{fetcher:async()=>response()});
 assert.equal(received,body.length);
 const reopened=new AudioRepository();const rows=await reopened.downloadGetAll();assert.equal(rows.length,2);assert.deepEqual(new Set(rows.map(r=>r.key)),new Set(['alnufais:1','alhusaini:1']));
 for(const row of rows){assert.ok(matchingDownload(row,recording));assert.deepEqual(new Uint8Array(await row.file.arrayBuffer()),body);}
 assert.equal(matchingDownload(rows[0],{...recording,sha256:'0'.repeat(64)}),false);
 await repo.downloadDelete(['alnufais:1']);assert.deepEqual((await repo.downloadGetAll()).map(r=>r.key),['alhusaini:1']);assert.equal((await repo.audioGetAll()).length,1);
 await repo.downloadDelete(['alhusaini:1']);
});

test('failed, truncated, oversized, corrupt and cancelled downloads never become playable',async()=>{
 await assert.rejects(downloadAudio('alnufais',recording,{fetcher:async()=>new Response('error',{status:503})}));
 await assert.rejects(downloadAudio('alnufais',recording,{fetcher:async()=>new Response(body.slice(0,5))}),/يكتمل/);
 await assert.rejects(downloadAudio('alnufais',recording,{fetcher:async()=>new Response(new Uint8Array(body.length+1))}),/يطابق/);
 await assert.rejects(downloadAudio('alnufais',recording,{fetcher:async()=>new Response(new Uint8Array(body.length))}),/يطابق/);
 const controller=new AbortController();await assert.rejects(downloadAudio('alnufais',recording,{signal:controller.signal,fetcher:async()=>response(),onProgress:()=>controller.abort()}),{name:'AbortError'});
 await assert.rejects(downloadAudio('alnufais',recording,{fetcher:async()=>{throw TypeError('offline')}}));assert.deepEqual(await repo.downloadGetAll(),[]);
 const quota=Object.assign(Error('full'),{name:'QuotaExceededError'});assert.match(downloadError(quota),/المساحة/);assert.match(downloadError(new DOMException('cancel','AbortError')),/تبقى/);
});

test('real bundled bytes match the downloaded voice and its timing hash without changing audio',async()=>{
 const catalog=JSON.parse(await fs.readFile(new URL('../public/audio-catalog.json',import.meta.url)));const voices=[catalog,...catalog.alternatives];
 for(const voice of voices){const r=voice.recordings[0],bytes=await fs.readFile(new URL('../public/'+r.url,import.meta.url));const row=await downloadAudio(voice.id,r,{fetcher:async()=>new Response(bytes)});assert.equal(row.sha256,r.sha256);assert.equal(row.file.size,r.bytes);assert.ok(matchingDownload(row,r));}
 await repo.downloadDelete(voices.map(c=>downloadKey(c.id,1)));
});

test('bundled SHA-256 fallback matches the standard vector and platform implementation',()=>{assert.equal(Buffer.from(sha256(new TextEncoder().encode('abc'))).toString('hex'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');const bytes=new Uint8Array(120000).map((_,i)=>i%251);assert.equal(Buffer.from(sha256(bytes)).toString('hex'),createHash('sha256').update(bytes).digest('hex'));});
