'use strict';
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
let failed=false;
for(const file of fs.readdirSync(__dirname).filter(f=>f.endsWith('.test.js')).sort()){
 const r=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)failed=true;
}
process.exitCode=failed?1:0;
