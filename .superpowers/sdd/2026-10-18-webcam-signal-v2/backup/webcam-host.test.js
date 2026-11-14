'use strict';
const assert=require('assert');let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};
class El{constructor(tag){this.tagName=tag;this.style={};this.children=[];this.listeners={};this.attributes={};this.value='';this.textContent='';}appendChild(e){this.children.push(e);e.parentNode=this;return e;}removeChild(e){this.children.splice(this.children.indexOf(e),1);e.parentNode=null;}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,f){this.listeners[k]=f;}removeEventListener(k){delete this.listeners[k];}focus(){global.document.activeElement=this;}getBoundingClientRect(){return {left:20,top:30,width:640,height:480};}getContext(){return {drawImage(){},strokeRect(){},fillRect(){},clearRect(){}};}click(){if(this.onclick)this.onclick({stopPropagation(){},preventDefault(){}});}}
global.document={body:new El('body'),createElement:t=>new El(t)};global.THREE={};global.MonsterCommands=require('./commands.js');
global.MonsterPresenter={createBattlePresenter(){return {diagnostics:{ready:true},enter(){return true;},sync(){},update(){},render(){},suspend(){},resume(){},leave(){},dispose(){}};}};
const W=require('./webcam.js');
function all(e){return [e,...e.children.flatMap(all)];}
const find=t=>all(document.body).find(e=>e.textContent===t);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms){const end=Date.now()+ms;while(!fn()&&Date.now()<end)await wait(5);return fn();}
const STORE='Storage unavailable. Settings apply in memory for this session.';
let settings={actionMode:'ON',quality:'STANDARD'},saves=0,saveOk=true,modal=false;let listener=null;
const cam={state:'live',meter:.3,video:null,stops:0,floors:0,supported:()=>true,stop(){this.stops++;this.state='off';},measureFloor(){this.floors++;},setCalibrationListener(fn){listener=fn;}};
let clock=0;
const H=require('./host.js');const canvas=new El('canvas');canvas.parentNode=new El('div');
const host=H.createHost({canvas,species:{},getSettings:()=>settings,setSettings:s=>settings=s,save:()=>{saves++;return saveOk;},onModal:v=>modal=v,onInputReset:()=>{},webcam:cam,now:()=>clock,calibrationTiming:{still:20,lead:30,miss:400,poll:5,wait:200}});
async function run(){
 host.sync({mine:{id:'emberling'}},.016);await wait(10);
 // settings rows
 host.openSettings();const selects=all(document.body).filter(e=>e.tagName==='select');
 ok(selects.length===4,'action, quality, webcam, sensitivity selects');ok(selects[2].value==='OFF'&&selects[3].value==='MED','webcam rows show current values');
 ok(find('Calibrate webcam'),'calibrate button');ok(find('Calibrate webcam').disabled===true&&find('Calibrate during a battle with the webcam ON.'),'calibrate disabled while webcam OFF');
 selects[3].value='HIGH';find('Apply settings').click();ok(settings.webcamSensitivity==='HIGH'&&settings.webcamLagMs===120,'apply keeps webcam keys');
 settings=Object.assign({},settings,{webcamLagMs:200,webcamCalibrated:true});find('Apply settings').click();ok(settings.webcamLagMs===200&&settings.webcamCalibrated===true,'apply does not wipe calibration');
 find('Close').click();ok(!modal,'closed');
 // turning ON while uncalibrated opens calibration
 settings=Object.assign({},settings,{webcamCalibrated:false});host.openSettings();all(document.body).filter(e=>e.tagName==='select')[2].value='ON';find('Apply settings').click();
 ok(settings.webcam==='ON','webcam ON persisted');ok(host.diagnostics.calibration&&host.diagnostics.calibration.step==='still','calibration opens when uncalibrated');ok(cam.floors===1,'calibration measures the floor');ok(modal,'calibration is modal');
 // still -> rings; three punches 100 ms late
 await wait(40);ok(host.diagnostics.calibration.step==='rings','rings after the still step');
 const M=z=>({zones:[0,0,0,0,z,0,0,0,0],total:z,centroidX:.5,centroidY:.5,event:z>=W.BURST_MIN?'burst':null});
 for(let i=0;i<3;i++){const ringAt=host.diagnostics.calibration.ringAt;clock=ringAt+100;listener(M(.5),clock);listener(M(0),clock+10);await wait(5);}
 ok(host.diagnostics.calibration.step==='done'&&host.diagnostics.calibration.lag===100,'median lag measured');
 find('DONE').click();ok(settings.webcamLagMs===100&&settings.webcamCalibrated===true,'DONE saves lag and calibrated');ok(!modal&&listener===null,'DONE closes and detaches the listener');
 // TURN OFF keeps the calibration
 host.openCalibration();find('TURN OFF').click();ok(settings.webcam==='OFF'&&settings.webcamCalibrated===true&&settings.webcamLagMs===100,'TURN OFF keeps calibration');ok(cam.stops===1,'TURN OFF stops the camera');
 // a camera that dies during calibration stops the card instead of looping
 cam.state='live';host.openCalibration();cam.state='denied';await wait(30);ok(host.diagnostics.calibration.step==='failed'&&find('Camera unavailable: keyboard and touch still work.'),'dead camera: calibration reports failure');
 find('RETRY').click();await wait(20);ok(host.diagnostics.calibration.step==='failed','retry with a dead camera fails again, no loop');
 // Escape closes the card (same handler as the settings panel)
 const dlg=all(document.body).find(e=>e.attributes&&e.attributes.role==='dialog');dlg.listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});ok(!modal&&listener===null,'Escape closes calibration');
 // auto-open right after Apply: the game starts the camera on its next frame, so 'off' must wait, not fail
 settings=Object.assign({},settings,{webcam:'OFF',webcamCalibrated:false});cam.state='off';host.openSettings();all(document.body).filter(e=>e.tagName==='select')[2].value='ON';find('Apply settings').click();
 ok(host.diagnostics.calibration&&host.diagnostics.calibration.step==='waiting','off camera: calibration waits after Apply');
 await wait(30);ok(host.diagnostics.calibration.step==='waiting','still waiting while the camera starts');
 cam.state='live';ok(await until(()=>host.diagnostics.calibration.step==='rings',150),'camera went live: calibration proceeds');
 // RETRY resets the motion edge: an early (ignored) burst must not swallow the next punch
 {const c=host.diagnostics.calibration;listener(M(.5),c.ringAt-1000);find('RETRY').click();ok(await until(()=>c.step==='rings',150),'retry reaches rings');clock=c.ringAt+100;listener(M(.5),clock);ok(c.onsets.length===1,'retry resets low');listener(M(0),clock+10);
  for(let i=0;i<2;i++){await wait(5);const ringAt=c.ringAt;clock=ringAt+100;listener(M(.5),clock);listener(M(0),clock+10);}
  ok(c.step==='done'&&c.lag===100,'lag measured after retry');}
 // storage failure on DONE is reported, settings still apply in memory
 saveOk=false;find('DONE').click();ok(find(STORE)&&settings.webcamCalibrated===true&&settings.webcamLagMs===100,'DONE with failed save notifies');
 // a camera that never starts fails after T.wait instead of waiting forever
 cam.state='off';saveOk=true;host.openCalibration();
 await wait(100);ok(host.diagnostics.calibration.step==='waiting'&&host.diagnostics.calibration.timers<=2,'poll loop keeps the timer list small');
 ok(await until(()=>host.diagnostics.calibration.step==='failed',2000)&&find('Camera did not start: keyboard and touch still work.'),'camera that never starts fails after T.wait');
 // focus trap skips the disabled DONE
 {const d=all(document.body).find(e=>e.attributes&&e.attributes.role==='dialog');d.querySelectorAll=()=>all(d).filter(e=>['button','select','input'].includes(e.tagName));const ev=(shiftKey)=>({key:'Tab',shiftKey,preventDefault(){},stopPropagation(){}});
  find('TURN OFF').focus();d.listeners.keydown(ev(false));ok(document.activeElement===find('RETRY'),'Tab wraps to the first enabled control');
  d.listeners.keydown(ev(true));ok(document.activeElement===find('TURN OFF'),'Shift+Tab wraps from the first enabled control');}
 // storage failure on TURN OFF is reported
 {const before=find(STORE);saveOk=false;find('TURN OFF').click();const after=find(STORE);ok(after&&after!==before&&settings.webcam==='OFF','TURN OFF with failed save notifies');saveOk=true;}
 // badge
 cam.state='live';host.sync({mine:{id:'emberling'}},.016);const badge=all(document.body).find(e=>e.attributes['aria-label']==='Webcam control on');ok(badge,'camera badge while live');
 // badge stays clear of the foe HP box (canvas px 24,28 260x52) and the SETTINGS button at desktop and touch-portrait scale
 {const hit=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h,px=v=>parseFloat(v);
  for(const [w,h] of [[640,480],[348,261]]){canvas.getBoundingClientRect=()=>({left:20,top:30,width:w,height:h});host.sync({mine:{id:'emberling'}},.016);const sc=w/640,st=badge.style;
   const b={x:(px(st.left)-20)/sc,y:(px(st.top)-30)/sc,w:px(st.width)/sc,h:px(st.height)/sc};ok(!hit(b,{x:24,y:28,w:260,h:52}),'badge clear of the foe HP box at width '+w);
   const bc={x:px(st.left),y:px(st.top),w:px(st.width),h:px(st.height)};ok(!hit(bc,{x:20+w-118,y:30+7,w:108,h:44}),'badge clear of SETTINGS at width '+w);}
  delete canvas.getBoundingClientRect;}
 cam.state='noisy';host.sync({mine:{id:'emberling'}},.016);ok(badge.title==='Too much motion','noisy badge title');
 cam.state='off';host.sync({mine:{id:'emberling'}},.016);ok(!all(document.body).includes(badge),'badge removed when off');
 // suspend (blur / modal) also refreshes the badge
 cam.state='live';host.sync({mine:{id:'emberling'}},.016);{const b2=all(document.body).find(e=>e.attributes['aria-label']==='Webcam control on');ok(b2,'badge back while live');cam.state='off';host.suspend();ok(!all(document.body).includes(b2),'suspend removes the badge once the camera is off');}
 // notify
 host.notify('Camera blocked: keyboard and touch still work.');ok(find('Camera blocked: keyboard and touch still work.'),'toast shown');
 // unsupported
 cam.supported=()=>false;host.openSettings();{const sel=all(document.body).filter(e=>e.tagName==='select'),boxes=all(document.body).filter(e=>e.tagName==='input'&&e.type==='checkbox');ok(sel[2].disabled===true,'webcam row disabled when unsupported');ok(sel[3].disabled===true&&boxes[2].disabled===true,'sensitivity and mirror disabled when unsupported');}ok(find('Webcam: not available in this browser.'),'unsupported message');find('Close').click();
 host.leave();ok(!all(document.body).some(e=>e.attributes&&e.attributes['aria-label']==='Webcam control on'),'leave removes the badge');
 host.dispose();
 console.log('webcam host: '+checks+' checks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
