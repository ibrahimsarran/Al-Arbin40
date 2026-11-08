import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { StudyRepository } from '../public/js/repositories/study-repository.mjs';
import { AudioRepository } from '../public/js/repositories/audio-repository.mjs';
import {AudioPlayer} from '../public/js/audio/audio-player.mjs';
import {bootApplication} from './helpers/load-app.mjs';

const require=createRequire(import.meta.url);
const {JSDOM,VirtualConsole}=require(process.env.JS_DOM_PATH||'jsdom');
const {IDBFactory}=require(process.env.FAKE_IDB_PATH||'fake-indexeddb');
const root=path.resolve(import.meta.dirname,'../public');
const flush=()=>new Promise(resolve=>setTimeout(resolve,15));

test('injected repositories preserve existing keys and isolate independent storage contexts',async()=>{
  const data=new Map([['arbaeen-v1:notes','{"1":"existing note"}']]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const existing=new StudyRepository(storage),other=new StudyRepository(storage,'other:');
  assert.equal(existing.read('notes',{})[1],'existing note');
  other.write('notes',{1:'separate'});
  assert.equal(existing.read('notes',{})[1],'existing note');
  const a=new AudioRepository(new IDBFactory()),b=new AudioRepository(new IDBFactory());
  await a.audioPut(7,new File(['voice'],'personal.mp3',{type:'audio/mpeg'}));
  assert.equal((await a.audioGetAll()).length,1);
  assert.equal((await b.audioGetAll()).length,0);
  await a.close();await b.close();
});

function mediaFixture(){
  const dom=new JSDOM('<audio></audio><input type="range" max="1000"><span></span>');
  const audio=dom.window.document.querySelector('audio');
  Object.defineProperty(audio,'readyState',{get:()=>1});
  Object.defineProperty(audio,'duration',{get:()=>100});
  audio.load=()=>{};audio.pause=()=>{};
  const player=new AudioPlayer(audio,{range:dom.window.document.querySelector('input'),clock:dom.window.document.querySelector('span')});
  return {dom,audio,player};
}

test('a late failed play request cannot replace the newer active media session',async()=>{
  const {dom,audio,player}=mediaFixture();let rejectFirst,calls=0;
  audio.play=()=>++calls===1?new Promise((_,reject)=>{rejectFirst=reject;}):Promise.resolve();
  const first=player.play(1,{url:'one.mp3'});
  assert.equal(await player.play(2,{url:'two.mp3'},{speed:1.5}),true);
  rejectFirst(Object.assign(new Error('interrupted'),{name:'AbortError'}));
  assert.equal(await first,false);
  assert.equal(player.activeAudio,2);assert.equal(audio.getAttribute('src'),'two.mp3');assert.equal(audio.playbackRate,1.5);
  player.destroy();dom.window.close();
});

test('disposing an audio player invalidates pending playback and detaches seek listeners',async()=>{
  const {dom,audio,player}=mediaFixture();let resolvePlay;
  audio.play=()=>new Promise(resolve=>{resolvePlay=resolve;});
  const pending=player.play(1,{url:'one.mp3'});
  player.destroy();resolvePlay();assert.equal(await pending,false);
  const clock=dom.window.document.querySelector('span');clock.textContent='disposed';
  audio.dispatchEvent(new dom.window.Event('timeupdate'));
  assert.equal(clock.textContent,'disposed');assert.equal(player.activeAudio,null);assert.equal(audio.getAttribute('src'),null);
  dom.window.close();
});

test('disposing and replacing a reader does not leave old UI handlers active',async()=>{
  const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(await fs.readFile(path.join(root,'index.html'),'utf8'),{url:'https://test.example/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window;w.indexedDB=new IDBFactory();w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.fetch=async url=>({ok:true,json:async()=>JSON.parse(await fs.readFile(path.join(root,url),'utf8'))});
  w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.pause=function(){};
  w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
  const boot=await bootApplication(w,root);let oldCalls=0;
  boot.application.applySettings=()=>{oldCalls++;};boot.application.destroy();
  const ReaderController=boot.modules['js/controllers/reader-controller.mjs'].ReaderController;
  const next=new ReaderController();await next.start();
  w.document.querySelector('[data-action="theme"]').click();await flush();
  assert.equal(oldCalls,0);assert.equal(w.document.body.classList.contains('dark'),true);assert.deepEqual(errors,[]);
  next.destroy();boot.language.destroy();dom.window.close();
});
