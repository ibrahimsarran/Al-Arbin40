import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

test('every module needed by the reader resolves and is available in the offline shell',()=>{
 const root=path.resolve(import.meta.dirname,'../public');
 const cacheFiles=vm.runInNewContext(fs.readFileSync(path.join(root,'service-worker.js'),'utf8').split("self.addEventListener('install'")[0]+'; FILES');
 const cached=new Set(cacheFiles.map(file=>path.resolve(root,file)));
 const visited=new Set();
 function visit(file){
  if(visited.has(file))return;
  visited.add(file);
  assert.ok(fs.existsSync(file),'Unresolved module: '+path.relative(root,file));
  assert.ok(cached.has(file),'Module missing from the offline shell: '+path.relative(root,file));
  const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  for(const node of ast.statements){
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier){
    const specifier=node.moduleSpecifier.text;
    assert.ok(specifier.startsWith('.'),'Unexpected browser package import: '+specifier);
    visit(path.resolve(path.dirname(file),specifier));
   }
  }
 }
 visit(path.join(root,'app.mjs'));
 assert.ok(visited.size>=20,'The complete reader dependency graph must be visited');
});
