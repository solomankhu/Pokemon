'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const file=path.resolve('combat/webcam-scenarios.test.js'),src=fs.readFileSync(file,'utf8');
const prefix=src.slice(0,src.indexOf('const nuisPeak={}'));
const driver=src.slice(src.indexOf('function runGesture('),src.indexOf('const GSCENE='));
const extra=`let total=0;for(const name of Object.keys(NUIS))for(const seed of [1,2,3]){const sc=NUIS[name](seed);sc.dur=30;sc.sigma=2+seed;const r=runGesture(sc);assert.equal(r.keys.length,0,'menu nuisance '+name+' seed '+seed+' navigation');assert.equal(r.actions.length,0,'menu nuisance '+name+' seed '+seed+' actions');total+=2;}console.log('phase-aware nuisance actions/navigation: '+total+' checks passed');`;
new Function('require','__dirname',prefix+driver+extra)(require('module').createRequire(file),path.dirname(file));
