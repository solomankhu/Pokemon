const fs=require('fs'),vm=require('vm'),path=require('path');
const file=path.resolve('combat/webcam-clips.test.js');
let src=fs.readFileSync(file,'utf8');
src=src.slice(0,src.indexOf('const rows=[],per='));
src+=`for(const f of files){const c=W.decodeClip(fs.readFileSync(f,'utf8')); const r=replay(c);console.log(path.basename(f),JSON.stringify(r.detail));}`;
vm.runInNewContext(src,{require:require('module').createRequire(file),__dirname:path.dirname(file),process,console});
