import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StudyRepository } from '../public/js/repositories/study-repository.mjs';
import {HadithService} from '../public/js/services/hadith-service.mjs';
import {StudyService} from '../public/js/services/study-service.mjs';

const hadiths=JSON.parse(fs.readFileSync(new URL('../public/hadiths.json',import.meta.url)));
function fixture() {
  const values=new Map([['arbaeen-v1:notes','{"1":"existing note"}']]);
  const repository=new StudyRepository({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)});
  return {values,study:new StudyService(repository,new HadithService(hadiths))};
}
test('study operations preserve existing keys, source positions and export format',()=>{
  const {study,values}=fixture();
  assert.equal(study.notes[1],'existing note');
  assert.equal(study.toggleBookmark(2,5),true);
  assert.equal(study.isSaved(2,5),true);
  study.remember(2,5);study.setProgress(2,'memorized');study.saveNote(2,'new note');
  assert.equal(study.last.page,study.hadithService.pageFor(2,5));
  assert.equal(JSON.parse(values.get('arbaeen-v1:notes'))[1],'existing note');
  const backup=study.createBackup();assert.equal(backup.format,'arbaeen-reader');assert.equal(backup.version,1);
  const other=fixture().study;assert.equal(other.mergeBackup(backup),true);
  assert.equal(other.isSaved(2,5),true);assert.equal(other.notes[2],'new note');assert.equal(other.progress[0].state,'memorized');
});
test('invalid backup word positions are rejected before study data changes',()=>{
  const {study}=fixture(),before=JSON.stringify(study.createBackup());
  const invalid={format:'arbaeen-reader',version:1,bookmarks:[{id:1,word:1999}],progress:[],notes:{1:'must not replace'}};
  assert.throws(()=>study.mergeBackup(invalid),/موضع الكلمة/);
  const after=study.createBackup();delete after.exportedAt;const expected=JSON.parse(before);delete expected.exportedAt;
  assert.deepEqual(after,expected);
});
test('storage failures are reported to the UI without exposing or changing storage keys',()=>{
  let errors=0;
  const study=new StudyService(new StudyRepository({getItem:()=>null,setItem:()=>{throw Error('quota');}}),new HadithService(hadiths),()=>errors++);
  assert.equal(study.saveNote(1,'local draft'),false);assert.equal(errors,1);assert.equal(study.notes[1],'local draft');
});
