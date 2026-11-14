'use strict';
/* The 3D battle's condition tag (conditions Chunk 3): a DOM tag under the foe HP box, in canvas-scaled
   units (lesson overlay-fixed-css-px), hidden for clear, outside battle, in 2D mode and while suspended. */
const assert=require('assert');let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};
let rect={left:20,top:30,width:640,height:480};
class El{constructor(tag){this.tagName=tag;this.style={};this.children=[];this.listeners={};this.attributes={};this.textContent='';}appendChild(e){this.children.push(e);e.parentNode=this;return e;}removeChild(e){this.children.splice(this.children.indexOf(e),1);e.parentNode=null;}setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}addEventListener(k,f){this.listeners[k]=f;}removeEventListener(k){delete this.listeners[k];}focus(){}getBoundingClientRect(){return rect;}}
global.document={body:new El('body'),createElement:t=>new El(t)};global.THREE={};
global.MonsterPresenter={createBattlePresenter(){return {diagnostics:{ready:true},enter(){return true;},sync(){},update(){},render(){},suspend(){},resume(){},leave(){},dispose(){}};}};
const H=require('./host.js');const canvas=new El('canvas');canvas.parentNode=new El('div');
let settings={};const host=H.createHost({canvas,species:{},getSettings:()=>settings,setSettings:s=>settings=s});
function all(e){return [e,...e.children.flatMap(all)];}
const tag=()=>all(document.body).find(e=>e.attributes&&e.attributes['data-role']==='condition-tag');
const shown=()=>{const t=tag();return !!t&&t.style.display!=='none';};
const wait=()=>new Promise(r=>setTimeout(r,10));
const snap=c=>({mine:{id:'emberling'},foe:{id:'emberling'},arena:'meadow',condition:c});
const px=v=>parseFloat(v);
function hits(a,b){return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;}
async function run(){
 ok(typeof host.updateConditionTag==='function','host.updateConditionTag exists');
 host.sync(snap('rain'),.016);ok(!shown(),'no tag while 3D is still loading');await wait();host.sync(snap('rain'),.016);
 ok(host.is3D()&&shown(),'rain shows the tag in 3D');const t=tag();ok(t.textContent==='RAIN','text RAIN');ok(t.attributes['aria-label']==='Battle condition: rain','aria-label');
 ok(t.style.pointerEvents==='none','the tag never takes input');
 for(const [id,text] of [['sun','SUN'],['fog','FOG'],['night','NIGHT'],['tremor','TREMOR'],['static','STATIC']]){host.updateConditionTag(snap(id));ok(shown()&&tag().textContent===text&&tag().attributes['aria-label']==='Battle condition: '+id,id+' -> '+text);}
 host.updateConditionTag({condition:'rain'});ok(shown()&&tag().textContent==='RAIN','updateConditionTag({condition:"rain"})');
 for(const c of ['clear',undefined,null,'hail','__proto__']){host.updateConditionTag(snap(c));ok(!shown(),'hidden for '+String(c));}
 host.sync(snap('fog'),.016);ok(shown(),'sync updates the tag');
 host.sync(Object.assign(snap('static'),{hunt:true,scare:'dark'}),.016);ok(!shown(),'hidden while the hunt intro is dark (foe HP box hidden)');
 host.sync(Object.assign(snap('static'),{hunt:true,scare:'settled'}),.016);ok(shown()&&tag().textContent==='STATIC','back after the reveal');
 host.suspend();ok(!shown(),'suspend hides the tag');host.sync(snap('rain'),.016);ok(shown(),'sync shows it again');
 // Canvas-scaled placement at full size and at the touch-portrait width (about 348 px).
 for(const r of [{left:20,top:30,width:640,height:480},{left:21,top:64,width:348,height:261}]){rect=r;host.sync(snap('tremor'),.016);const s=r.width/640,st=tag().style;
  const box={x:(px(st.left)-r.left)/s,y:(px(st.top)-r.top)/s,w:px(st.width)/s,h:px(st.height)/s};
  ok(Math.abs(box.x-30)<1e-6&&Math.abs(box.y-108)<1e-6,r.width+': at canvas (30,108) ('+box.x+','+box.y+')');ok(Math.abs(box.w-66)<1e-6&&Math.abs(box.h-16)<1e-6,r.width+': 66x16 canvas px');
  ok(st.boxSizing==='border-box','border stays inside the 66x16 box');
  ok(!hits(box,{x:24,y:28,w:260,h:52}),r.width+': clear of the foe HP box');ok(box.y+box.h<248,r.width+': above the player HP box at y=248');
  ok(px(st.fontSize)>0&&px(st.fontSize)<=px(st.height),r.width+': font scales with the canvas');}
 rect={left:20,top:30,width:640,height:480};canvas.clientLeft=2;canvas.clientTop=2;canvas.clientWidth=636;
 host.sync(snap('rain'),.016);ok(Math.abs(px(tag().style.left)-(22+30*636/640))<1e-6,'border included in condition tag left');ok(Math.abs(px(tag().style.top)-(32+108*636/640))<1e-6,'border included in condition tag top');delete canvas.clientLeft;delete canvas.clientTop;delete canvas.clientWidth;
 // 2D (basic presentation) draws its own tag on the canvas, so the DOM tag hides.
 settings={basicMode:true};host.leave();ok(!tag(),'leave removes the tag');host.sync(snap('rain'),.016);ok(!host.is3D()&&!shown(),'hidden in 2D mode');
 settings={};host.leave();host.sync(snap('rain'),.016);await wait();host.sync(snap('rain'),.016);ok(shown(),'3D again');
 host.sync(null);ok(!tag(),'outside battle: removed');
 host.dispose();ok(!tag(),'dispose removes the tag');
 const src=require('fs').readFileSync(require('path').join(__dirname,'host.js'),'utf8');ok(!/innerHTML/.test(src),'host.js never uses innerHTML');
 console.log('condition tag: '+checks+' checks (text, aria-label, hidden clear/2D/dark/suspend/outside, canvas-scaled at 640 and 348)');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
