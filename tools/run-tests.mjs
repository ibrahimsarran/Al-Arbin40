import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const files=readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>path.join(root,'tests',f));
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
