import fs from 'node:fs/promises';
import path from 'node:path';

// jsdom does not execute module scripts. Load the real dependency graph in its realm.
// This adapter is test-only; production uses native browser ES modules.
export async function bootApplication(window,root,{downloadAudio}={}) {
  window.__testModules=Object.create(null);
  async function load(id) {
    if(window.__testModules[id])return window.__testModules[id];
    let source=await fs.readFile(path.join(root,id),'utf8');
    const imports=[...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)];
    for(const match of imports)await load(path.posix.normalize(path.posix.join(path.posix.dirname(id),match[2])));
    source=source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm,(_,names,from)=>{
      const dep=path.posix.normalize(path.posix.join(path.posix.dirname(id),from));
      return `const {${names.replace(/\s+as\s+/g,':')}}=window.__testModules[${JSON.stringify(dep)}];`;
    });
    const exports=[];
    source=source.replace(/export\s*\{([^}]+)\};?/g,(_,items)=>{for(const item of items.split(',')){const [local,name]=item.trim().split(/\s+as\s+/);exports.push(`${name||local}:${local}`);}return '';});
    source=source.replace(/export\s+((?:async\s+)?function|class|const|let)\s+([\w$]+)/g,(_,kind,name)=>{exports.push(name);return `${kind} ${name}`;});
    const module=await window.eval(`(async()=>{${source}\nreturn {${exports.join(',')}};})()\n//# sourceURL=test-module/${id}`);
    if(id==='js/services/audio-download-service.mjs'&&downloadAudio){
      module.AudioDownloadService=class extends module.AudioDownloadService {
        download(reader,recording,options){return downloadAudio(reader,recording,options,this.audioRepository);}
      };
    }
    window.__testModules[id]=module;
    return module;
  }
  const entry=await load('app.mjs');
  window.translateUI=window.__testModules['js/controllers/language-controller.mjs'].translateUI;
  return {...entry,modules:window.__testModules};
}
