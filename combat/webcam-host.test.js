'use strict';
const assert=require('assert');let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};
let draws=0;
class El{constructor(tag){this.tagName=tag;this.style={};this.children=[];this.listeners={};this.attributes={};this.value='';this.textContent='';}appendChild(e){this.children.push(e);e.parentNode=this;return e;}removeChild(e){this.children.splice(this.children.indexOf(e),1);e.parentNode=null;}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,f){this.listeners[k]=f;}removeEventListener(k){delete this.listeners[k];}focus(){global.document.activeElement=this;}getBoundingClientRect(){return {left:20,top:30,width:640,height:480};}getContext(){return {drawImage(){},strokeRect(){},fillRect(){},clearRect(){},fillText(){draws++;}};}click(){if(this.onclick)this.onclick({stopPropagation(){},preventDefault(){}});}}
global.document={body:new El('body'),createElement:t=>new El(t)};global.THREE={};global.MonsterCommands=require('./commands.js');
global.MonsterPresenter={createBattlePresenter(){return {diagnostics:{ready:true},enter(){return true;},sync(){},update(){},render(){},suspend(){},resume(){},leave(){},dispose(){}};}};
const W=require('./webcam.js');
function all(e){return [e,...e.children.flatMap(all)];}
const find=t=>all(document.body).find(e=>e.textContent===t);
// Settings rows are found by their label text, never by position (amendment: rows were added).
function field(label){const l=all(document.body).find(e=>e.tagName==='label'&&(e.textContent.trim()===label||e.children.some(c=>c.tagName==='span'&&c.textContent.trim()===label)));return l&&l.children.find(c=>c.tagName==='select'||c.tagName==='input');}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms){const end=Date.now()+ms;while(!fn()&&Date.now()<end)await wait(5);return fn();}
const STORE='Storage unavailable. Settings apply in memory for this session.';
let settings={actionMode:'ON',quality:'STANDARD'},saves=0,saveOk=true,modal=false;let listener=null;
const cam={state:'live',meter:.3,video:null,stops:0,floors:0,lastMotion:null,supported:()=>true,stop(){this.stops++;this.state='off';},measureFloor(){this.floors++;},setCalibrationListener(fn){listener=fn;}};
let clock=0;
const H=require('./host.js');const canvas=new El('canvas');canvas.parentNode=new El('div');
const host=H.createHost({canvas,species:{},getSettings:()=>settings,setSettings:s=>settings=s,save:()=>{saves++;return saveOk;},onModal:v=>modal=v,onInputReset:()=>{},webcam:cam,now:()=>clock,calibrationTiming:{still:20,lead:30,miss:400,poll:5,wait:200},clipTiming:{countdown:10,wait:150,revoke:30,stall:40}});
const M=z=>({zones:[0,0,0,0,z,0,0,0,0],total:z,centroidX:.5,centroidY:.5,event:z>=W.BURST_MIN?'burst':null});
// a v2 sample: zones empty, punch carries the configured zone's score
const P=p=>({zones:[0,0,0,0,0,0,0,0,0],total:.05,centroidX:null,centroidY:null,event:p>=.25?'burst':null,blob:{x:null,y:null,area:0},flow:{dx:0,dy:0,coh:0},punch:p,punchMin:.25});
// a v2 sample with motion zones, recent activity, pose and flow (gesture inputs), never a punch
const Gs=(z,pose,dy=0)=>({zones:z,recent:z,total:z.reduce((a,b)=>a+b,0)/9,centroidX:null,centroidY:null,event:null,blob:{x:.5,y:.5,area:.05},flow:{dx:0,dy,coh:.5},punch:0,punchMin:.25,pose});
const Z9=v=>[0,0,0,0,0,0,0,0,0].map((_,i)=>v[i]||0);
async function run(){
 host.sync({mine:{id:'emberling'}},.016);await wait(10);
 // settings rows (by label)
 host.openSettings();
 ok(field('Webcam control')&&field('Webcam control').tagName==='select'&&field('Webcam control').value==='OFF','webcam ON/OFF row shows the current value');
 {const g=field('Webcam gain');ok(g&&g.type==='range'&&g.min==='1'&&g.max==='9'&&g.value==='5','gain slider 1..9 shows the default 5');}
 ok(!all(document.body).some(e=>e.tagName==='label'&&e.textContent.trim()==='Webcam sensitivity'),'the LOW/MED/HIGH select is gone');
 ok(field('Punch zone')&&field('Punch zone').value==='CENTER','punch zone row');ok(field('Mirror webcam')&&field('Mirror webcam').checked===true,'mirror row');ok(field('Show webcam overlay in battle')&&field('Show webcam overlay in battle').checked===false,'overlay row (off by default)');
 ok(find('Calibrate webcam').disabled===true&&find('Test gestures').disabled===true&&find('Calibrate or test during a battle with the webcam ON.'),'calibrate and test disabled while webcam OFF');
 field('Webcam gain').value='7';field('Punch zone').value='LEFT';field('Show webcam overlay in battle').checked=true;find('Apply settings').click();
 ok(settings.webcamGain===7&&settings.webcamZone==='LEFT'&&settings.webcamOverlay===true&&settings.webcamLagMs===120,'apply keeps webcam keys (gain, zone, overlay, lag)');ok(settings.webcamSensitivity==='MED','apply never edits the frozen legacy sensitivity');
 settings=Object.assign({},settings,{webcamLagMs:200,webcamCalibrated:true});find('Apply settings').click();ok(settings.webcamLagMs===200&&settings.webcamCalibrated===true,'apply does not wipe calibration');
 find('Close').click();ok(!modal,'closed');
 // a legacy HIGH save shows gain 7
 settings=Object.assign({},settings,{webcamGain:undefined,webcamSensitivity:'HIGH'});host.openSettings();ok(field('Webcam gain').value==='7','legacy HIGH save shows gain 7');find('Close').click();
 settings=Object.assign({},settings,{webcamGain:5,webcamZone:'CENTER',webcamOverlay:false});
 // turning ON while uncalibrated opens calibration
 settings=Object.assign({},settings,{webcamCalibrated:false});host.openSettings();field('Webcam control').value='ON';find('Apply settings').click();
 ok(settings.webcam==='ON','webcam ON persisted');ok(host.diagnostics.calibration&&host.diagnostics.calibration.step==='still','calibration opens when uncalibrated');ok(cam.floors===1,'calibration measures the floor');ok(modal,'calibration is modal');
 // still -> rings; three punches 100 ms late (old-shape samples fall back to zones[4])
 await wait(40);ok(host.diagnostics.calibration.step==='rings','rings after the still step');
 for(let i=0;i<3;i++){const ringAt=host.diagnostics.calibration.ringAt;clock=ringAt+100;listener(M(.5),clock);listener(M(0),clock+10);await wait(5);}
 ok(host.diagnostics.calibration.step==='done'&&host.diagnostics.calibration.lag===100,'median lag measured');
 ok(host.diagnostics.calibration.punch===.25&&all(document.body).some(e=>/Measured delay: 100 ms\. Punch strength 0\.50, threshold 0\.25/.test(e.textContent)),'result shows delay and punch strength');
 find('DONE').click();ok(settings.webcamLagMs===100&&settings.webcamCalibrated===true&&settings.webcamPunch===.25,'DONE saves lag, calibrated and the punch threshold');ok(!modal&&listener===null,'DONE closes and detaches the listener');
 // zone LEFT with v2 samples: onsets and peaks use motion.punch; weak punches are floored above the still-step nuisance
 {settings=Object.assign({},settings,{webcamZone:'LEFT'});host.openCalibration();const c=host.diagnostics.calibration;ok(await until(()=>c.step==='still',150),'LEFT: still step');
  listener(P(.2),c.stillAt+15);listener(P(.25),c.stillAt+2);ok(c.nuisance===.2,'nuisance peak is recorded in the second half of the still step only');
  ok(await until(()=>c.step==='rings',150),'LEFT: rings');
  for(let i=0;i<3;i++){await until(()=>c.rings.length===i,150);const ringAt=c.ringAt;clock=ringAt+80;listener(P(.1),clock);listener(P(.16),clock+33);listener(P(.12),clock+66);listener(P(0),clock+500);await wait(5);}
  ok(c.step==='done'&&c.lag===80,'LEFT: lag from v2 punch onsets ('+c.lag+')');ok(c.peaks.join()==='0.16,0.16,0.16','LEFT: each punch records its peak within CAL_PEAK_MS');
  near(c.punch,.2*W.CAL_NUIS_K,1e-12,'weak punches: threshold floored at CAL_NUIS_K x the nuisance peak, above breathing/talking');
  find('DONE').click();ok(Math.abs(settings.webcamPunch-.3)<1e-9,'DONE saves the floored threshold');settings=Object.assign({},settings,{webcamZone:'CENTER'});}
 // TURN OFF keeps the calibration
 host.openCalibration();find('TURN OFF').click();ok(settings.webcam==='OFF'&&settings.webcamCalibrated===true&&settings.webcamLagMs===80,'TURN OFF keeps calibration');ok(cam.stops===1,'TURN OFF stops the camera');
 // a camera that dies during calibration stops the card instead of looping
 cam.state='live';host.openCalibration();cam.state='denied';await wait(30);ok(host.diagnostics.calibration.step==='failed'&&find('Camera unavailable: keyboard and touch still work.'),'dead camera: calibration reports failure');
 find('RETRY').click();await wait(20);ok(host.diagnostics.calibration.step==='failed','retry with a dead camera fails again, no loop');
 // Escape closes the card (same handler as the settings panel)
 const dlg=all(document.body).find(e=>e.attributes&&e.attributes.role==='dialog');dlg.listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});ok(!modal&&listener===null,'Escape closes calibration');
 // auto-open right after Apply: the game starts the camera on its next frame, so 'off' must wait, not fail
 settings=Object.assign({},settings,{webcam:'OFF',webcamCalibrated:false});cam.state='off';host.openSettings();field('Webcam control').value='ON';find('Apply settings').click();
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
 // Test gestures: same gating as Calibrate; a modal with a scratch tracker; never dispatches
 {settings=Object.assign({},settings,{webcam:'ON'});cam.state='live';host.openSettings();ok(find('Test gestures').disabled===false,'Test gestures enabled in a battle with the webcam ON');const floors=cam.floors,stops=cam.stops,before=JSON.stringify(settings);
  find('Test gestures').click();ok(modal&&host.diagnostics.settingsOpen&&host.diagnostics.testGestures&&typeof listener==='function','Test gestures is a modal with the listener attached');ok(find('Last gesture: none yet'),'label starts empty');ok(!find('RECORD')&&!all(document.body).some(e=>/RECORD/.test(e.textContent)),'RECORD (and its help) hidden when downloads are unsupported');
  listener(M(.5),10000);ok(find('Last gesture: PUNCH'),'a punch is labelled');listener(M(0),10100);listener(M(.5),10400);ok(find('Last gesture: CONFIRM (double punch)'),'a double punch is labelled CONFIRM');
  // v2 motion goes through the phase-'menu' tracker: a punch is named once the fist is back (it could still become a guard)
  listener(P(0),11900);listener(P(.5),12000);ok(!find('Last gesture: PUNCH (0.50)')&&find('Punch seen: it counts once your fist is back.'),'v2 punch: pending, with the reason');
  for(let t=12100;t<=12700;t+=100)listener(P(0),t);ok(find('Last gesture: PUNCH (0.50)'),'v2 punch is named after the wait, with its peak strength');
  // guard: forearms move into the middle row, then hold still with the middle cells changed
  {const c0=host.diagnostics.testGestures.count;for(let t=14000;t<14200;t+=50)listener(Gs(Z9({3:.4,4:.5}),Z9({3:.5,4:.6})),t);for(let t=14200;t<=14500;t+=50)listener(Gs(Z9({}),Z9({3:.5,4:.6})),t);
   ok(find('Last gesture: GUARD')&&host.diagnostics.testGestures.count===c0+1,'a crossed-forearms hold is labelled GUARD (once)');}
  // raise: a hand moves up into a top corner and stays
  {for(let t=16000;t<16200;t+=50)listener(Gs(Z9({2:.4,5:.3}),Z9({2:.4}),-.6),t);for(let t=16200;t<=16500;t+=50)listener(Gs(Z9({}),Z9({2:.4})),t);ok(find('Last gesture: RAISE'),'a raised, held hand is labelled RAISE');}
  ok(all(document.body).some(e=>e.tagName==='p'&&/GUARD = DEFEND/.test(e.textContent)&&/SHOVE = SWAP/.test(e.textContent)&&/LEAN/.test(e.textContent)),'help text lists the battle-menu gestures');
  const d=all(document.body).find(e=>e.attributes&&e.attributes.role==='dialog');d.listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});
  ok(!modal&&listener===null&&host.diagnostics.testGestures===null,'closing detaches the scratch listener');ok(cam.floors===floors&&cam.stops===stops&&JSON.stringify(settings)===before,'Test gestures touches no settings and no camera state (no input reaches the game)');}
 // RECORD: label select, 3-2-1 aria-live countdown, 3 s of post-warm-up frames, one download with the current settings
 {const downloads=[],blobs=[],revoked=[];let urls=0;const origCreate=document.createElement,origC=URL.createObjectURL,origR=URL.revokeObjectURL;
  document.createElement=t=>{const e=new El(t);if(t==='a'){e.download='';e.click=function(){downloads.push({href:this.href,name:this.download,inBody:document.body.children.includes(this)});};}return e;};
  URL.createObjectURL=b=>{blobs.push(b);return 'blob:clip-'+(++urls);};URL.revokeObjectURL=u=>revoked.push(u);
  const saved0=settings;settings=Object.assign({},settings,{webcam:'ON',webcamMirror:false,webcamGain:7,webcamZone:'RIGHT',webcamPunch:.3});cam.state='live';const floors=cam.floors,stops=cam.stops,before=JSON.stringify(settings);
  const dlg=()=>all(document.body).find(e=>e.attributes&&e.attributes.role==='dialog'),esc=()=>dlg().listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});
  const cd=()=>all(document.body).find(e=>e.attributes&&e.attributes['data-role']==='clip-countdown'),pick=()=>field('Clip label');
  host.openTestGestures();const tg=host.diagnostics.testGestures;
  ok(find('RECORD')&&find('RECORD').tagName==='button','RECORD shown when downloads are supported');
  ok(pick()&&pick().tagName==='select'&&pick().children.map(o=>o.value).join()===W.CLIP_LABELS.join(),'clip label select lists the allow-list');
  ok(cd()&&cd().attributes['aria-live']==='assertive'&&cd().textContent==='','countdown text is aria-live and starts empty');
  ok(all(document.body).some(e=>e.tagName==='p'&&/RECORD saves a 3-second clip/.test(e.textContent)),'help text mentions RECORD');
  {const l=find('Last gesture: none yet');ok(l&&l.attributes.role==='status','the gesture label keeps role=status');}
  const fr=k=>{const f=new Uint8Array(W.FRAME_W*W.FRAME_H);for(let i=0;i<f.length;i++)f[i]=(k*3+i)&255;return f;};
  const said=[];{let v=cd().textContent;Object.defineProperty(cd(),'textContent',{get(){return v;},set(x){v=x;said.push(x);}});}   // every countdown write, so no poll can miss a step
  pick().value='guard';find('RECORD').click();
  ok(cd().textContent==='3'&&find('RECORD').disabled&&pick().disabled,'RECORD starts a 3-2-1 countdown (button and select locked)');
  listener(P(0),100,fr(99),'live');ok(tg.recording.frames.length===0,'frames during the countdown are not recorded');
  await until(()=>said.length>=4,300);ok(said.slice(0,4).join('|')==='3|2|1|Recording guard...','countdown reads 3, 2, 1, then Recording ('+said.join('|')+')');
  listener(P(0),4990,fr(98),'warmup');ok(tg.recording.frames.length===0,'warm-up frames are skipped');
  // the controller hands each listener call a fresh copy (webcam.test.js checks that): the host keeps it, no second copy
  let n=0,kept=true;for(let t=5000;!tg.saved;t+=33){const f=fr(n);listener(P(n%7?0:.5),t,f,'live');if(tg.recording&&tg.recording.frames.length&&tg.recording.frames[tg.recording.frames.length-1]!==f)kept=false;n++;if(n>200)break;}
  ok(kept,'each recorded frame is the very array the controller passed (one copy per frame, not two)');
  ok(downloads.length===1&&downloads[0].name==='webcam-clip-guard-1.json'&&downloads[0].href==='blob:clip-1'&&downloads[0].inBody,'one download: webcam-clip-guard-1.json via Blob + <a download>');
  ok(!all(document.body).some(e=>e.tagName==='a'),'the temporary link is removed');
  ok(blobs.length===1&&blobs[0].type==='application/json','downloaded as a JSON Blob');
  const clip=W.decodeClip(await blobs[0].text());
  ok(clip&&clip.label==='guard'&&clip.mirror===false&&clip.gain===7&&clip.zone==='RIGHT'&&clip.punchMin===.3&&clip.w===W.FRAME_W&&clip.h===W.FRAME_H&&clip.v===1,'clip header carries the label and the current settings (mirror, gain, zone, punchMin)');
  ok(clip.frames.length===91&&clip.t[0]===0&&clip.t.at(-1)===2970,'3 s of frames, t relative to the first ('+clip.frames.length+')');
  ok(clip.frames.every((f,i)=>f[0]===fr(i)[0]&&f[4799]===fr(i)[4799]),'each frame holds the grey values it arrived with');
  ok(cd().textContent==='Saved webcam-clip-guard-1.json (91 frames).'&&!find('RECORD').disabled&&!pick().disabled,'saved message; RECORD re-enabled');
  ok(await until(()=>revoked.includes('blob:clip-1'),300),'the Blob URL is revoked after the download');
  ok(modal&&host.diagnostics.settingsOpen,'the modal stays open (game input blocked) for the whole recording');
  find('RECORD').click();ok(await until(()=>/^Recording/.test(cd().textContent),200),'second recording');for(let t=9000;!(tg.saved&&tg.saved.name==='webcam-clip-guard-2.json');t+=33){listener(P(0),t,fr(1),'live');if(t>14000)break;}
  ok(downloads.at(-1).name==='webcam-clip-guard-2.json','the clip number counts up per label');
  // Close right after a save: the pending revoke timer is cleared, so closing revokes the URL itself
  find('Close').click();ok(revoked.includes('blob:clip-2')&&listener===null&&!modal,'closing before the revoke timer still revokes the URL');
  // Escape mid-countdown: timers and listener cleared, nothing downloads later
  host.openTestGestures();let tg2=host.diagnostics.testGestures;find('RECORD').click();ok(tg2.timers>0,'countdown timers pending');const d0=downloads.length,b0=blobs.length;
  esc();ok(!modal&&listener===null&&tg2.timers===0&&host.diagnostics.testGestures===null,'Escape mid-countdown clears the timers and the listener');await wait(60);ok(downloads.length===d0&&blobs.length===b0,'no download after closing mid-countdown');
  // Close mid-record
  host.openTestGestures();tg2=host.diagnostics.testGestures;find('RECORD').click();ok(await until(()=>tg2.recording&&tg2.recording.phase==='waiting',200),'reached recording');const keep=listener;for(let t=0;t<600;t+=33)listener(P(0),t,fr(2),'live');ok(tg2.recording.frames.length>10,'recording in progress');
  find('Close').click();ok(!modal&&listener===null&&tg2.timers===0,'Close mid-record clears the timers and the listener');for(let t=600;t<4000;t+=33)keep(P(0),t,fr(2),'live');ok(downloads.length===d0&&blobs.length===b0,'a stale listener call after Close never downloads');
  // the camera stalls mid-record: after the stall timeout the frames so far are saved, and the message says so
  {host.openTestGestures();const tg4=host.diagnostics.testGestures,dn=downloads.length;find('RECORD').click();await until(()=>tg4.recording&&tg4.recording.phase==='waiting',200);
   for(let t=0;t<660;t+=33)listener(P(0),t,fr(4),'live');ok(await until(()=>tg4.saved,400),'a stall saves the partial clip');
   ok(tg4.saved.partial&&tg4.saved.frames===20&&downloads.length===dn+1&&/^Saved webcam-clip-[a-z]+-\d+\.json \(20 frames, partial: the camera stopped after 0\.6 s\)\.$/.test(cd().textContent)&&!find('RECORD').disabled,'the stall message names the partial clip ('+cd().textContent+')');
   find('Close').click();}
  // no camera frames: the watchdog gives up and re-enables RECORD
  host.openTestGestures();find('RECORD').click();ok(await until(()=>/^Recording failed: no camera frames/.test(cd().textContent),600)&&!find('RECORD').disabled,'no frames: recording fails and RECORD is re-enabled');find('Close').click();
  ok(cam.floors===floors&&cam.stops===stops&&JSON.stringify(settings)===before,'recording touches no settings and no camera state (no input reaches the game)');
  // a download that throws reports failure and leaves no URL behind
  URL.createObjectURL=()=>{throw new Error('blocked');};host.openTestGestures();const tg3=host.diagnostics.testGestures;find('RECORD').click();await until(()=>/^Recording/.test(cd().textContent),200);for(let t=0;!/failed|Saved/.test(cd().textContent)&&t<4000;t+=33)listener(P(0),t,fr(3),'live');
  ok(cd().textContent==='Recording failed: this browser could not save the file.'&&!tg3.saved,'a failed download is reported');find('Close').click();
  {const mm=global.matchMedia;global.matchMedia=q=>({matches:q==='(pointer: coarse)'});host.openTestGestures();ok(!find('RECORD')&&!all(document.body).some(e=>/RECORD saves/.test(e.textContent)),'RECORD hidden on a coarse (touch) pointer even when downloads work');find('Close').click();global.matchMedia=mm;}
  document.createElement=origCreate;URL.createObjectURL=origC;URL.revokeObjectURL=origR;settings=saved0;}
 // badge
 cam.state='live';host.sync({mine:{id:'emberling'}},.016);const badge=all(document.body).find(e=>e.attributes['aria-label']==='Webcam control on');ok(badge,'camera badge while live');
 // badge stays clear of the foe HP box (canvas px 24,28 260x52) and the SETTINGS button at desktop and touch-portrait scale
 const hit=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h,px=v=>parseFloat(v);
 {for(const [w,h] of [[640,480],[348,261]]){canvas.getBoundingClientRect=()=>({left:20,top:30,width:w,height:h});host.sync({mine:{id:'emberling'}},.016);const sc=w/640,st=badge.style;
   const b={x:(px(st.left)-20)/sc,y:(px(st.top)-30)/sc,w:px(st.width)/sc,h:px(st.height)/sc};ok(!hit(b,{x:24,y:28,w:260,h:52}),'badge clear of the foe HP box at width '+w);
   const bc={x:px(st.left),y:px(st.top),w:px(st.width),h:px(st.height)};ok(!hit(bc,{x:20+w-118,y:30+7,w:108,h:44}),'badge clear of SETTINGS at width '+w);}
  delete canvas.getBoundingClientRect;}
 // in-battle overlay: only with webcamOverlay and a live camera; canvas-scaled; clear of every HUD rect
 {const mask=new Uint8Array(W.FRAME_W*W.FRAME_H);mask[30*80+40]=1;cam.lastMotion={zones:[0,0,0,0,0,0,0,0,0],mask,width:80,height:60,punch:.1,punchMin:.25,event:null,reason:null,state:'live'};
  const ov=()=>all(document.body).find(e=>e.attributes&&e.attributes['data-role']==='webcam-overlay');
  settings=Object.assign({},settings,{webcamOverlay:false});host.sync({mine:{id:'emberling'}},.016);ok(!ov(),'no overlay while webcamOverlay is off');
  settings=Object.assign({},settings,{webcamOverlay:true});clock=50000;host.sync({mine:{id:'emberling'}},.016);const o=ov();ok(o&&o.tagName==='canvas'&&o.style.pointerEvents==='none'&&o.attributes['aria-hidden']==='true','overlay canvas: pointer-events none, aria-hidden');
  for(const w of [640,400,390,348]){const h=w*.75;canvas.getBoundingClientRect=()=>({left:20,top:30,width:w,height:h});host.sync({mine:{id:'emberling'}},.016);const sc=w/640,st=ov().style;
   const c={x:(px(st.left)-20)/sc,y:(px(st.top)-30)/sc,w:px(st.width)/sc,h:px(st.height)/sc},css={x:px(st.left),y:px(st.top),w:px(st.width),h:px(st.height)},gearL=20+w-118;
   for(const [name,r] of [['foe HP box',{x:24,y:28,w:260,h:52}],['2D player box',{x:0,y:248,w:640,h:232}],['3D player box',{x:0,y:286,w:640,h:194}],['condition tag',{x:30,y:108,w:66,h:16}],['text panel',{x:16,y:362,w:608,h:102}]])ok(!hit(c,r),'overlay clear of the '+name+' at width '+w);
   for(const [name,r] of [['SETTINGS',{x:gearL,y:37,w:108,h:44}],['CAM badge (left of SETTINGS)',{x:gearL-100,y:37,w:92,h:24}],['CAM badge (under SETTINGS)',{x:gearL,y:85,w:92,h:24}]])ok(!hit(css,r),'overlay clear of '+name+' at width '+w);
   ok(c.x>=0&&c.x+c.w<=640+1e-9,'overlay inside the canvas at width '+w);}
  delete canvas.getBoundingClientRect;
  canvas.clientLeft=2;canvas.clientTop=2;canvas.clientWidth=636;host.sync({mine:{id:'emberling'}},.016);
  ok(Math.abs(px(ov().style.left)-(22+520*636/640))<1e-6,'overlay includes canvas left border');ok(Math.abs(px(ov().style.top)-(32+Math.max(84*636/640,83)))<1e-6,'overlay includes canvas top border');delete canvas.clientLeft;delete canvas.clientTop;delete canvas.clientWidth;
  // refresh: <= 15 Hz normally, <= 3 Hz under reduced motion (static image, so it stays)
  const count=(rm)=>{settings=Object.assign({},settings,{reducedMotion:rm});draws=0;for(let t=0;t<=1000;t+=16){clock=60000+(rm?2000:0)+t;host.sync({mine:{id:'emberling'}},.016);}return draws;};
  const fast=count(false),slow=count(true);ok(fast>=10&&fast<=16,'overlay redraws at <= 15 Hz ('+fast+')');ok(slow>=1&&slow<=4&&ov(),'reduced motion: overlay kept, refreshed at <= 3 Hz ('+slow+')');settings=Object.assign({},settings,{reducedMotion:false});
  host.openSettings();ok(!ov(),'overlay hidden while a modal is open');find('Close').click();host.sync({mine:{id:'emberling'}},.016);ok(ov(),'overlay back after the modal');
  cam.state='off';host.sync({mine:{id:'emberling'}},.016);ok(!ov(),'overlay removed when the camera is not live');cam.state='live';host.sync({mine:{id:'emberling'}},.016);ok(ov(),'overlay back when live');}
 {cam.state='noisy';host.sync({mine:{id:'emberling'}},.016);const bn=all(document.body).find(e=>e.attributes['aria-label']==='Webcam control on');ok(bn&&bn.title==='Too much motion','noisy badge title');
 cam.state='off';host.sync({mine:{id:'emberling'}},.016);ok(!all(document.body).includes(bn),'badge removed when off');}
 // suspend (blur / modal) also refreshes the badge
 cam.state='live';host.sync({mine:{id:'emberling'}},.016);{const b2=all(document.body).find(e=>e.attributes['aria-label']==='Webcam control on');ok(b2,'badge back while live');cam.state='off';host.suspend();ok(!all(document.body).includes(b2),'suspend removes the badge once the camera is off');}
 // notify
 host.notify('Camera blocked: keyboard and touch still work.');ok(find('Camera blocked: keyboard and touch still work.'),'toast shown');
 // unsupported: every webcam control is disabled
 cam.supported=()=>false;host.openSettings();ok(['Webcam control','Webcam gain','Punch zone','Mirror webcam','Show webcam overlay in battle'].every(l=>field(l).disabled===true),'webcam rows (ON/OFF, gain, zone, mirror, overlay) disabled when unsupported');ok(find('Calibrate webcam').disabled&&find('Test gestures').disabled,'calibrate and test disabled when unsupported');ok(find('Webcam: not available in this browser.'),'unsupported message');find('Close').click();
 cam.supported=()=>true;cam.state='live';settings=Object.assign({},settings,{webcamOverlay:true});host.sync({mine:{id:'emberling'}},.016);
 host.leave();ok(!all(document.body).some(e=>e.attributes&&(e.attributes['aria-label']==='Webcam control on'||e.attributes['data-role']==='webcam-overlay')),'leave removes the badge and the overlay');
 host.dispose();
 console.log('webcam host: '+checks+' checks passed');
}
function near(a,b,e,m){ok(Math.abs(a-b)<=e,m+' ('+a+' vs '+b+')');}
run().catch(e=>{console.error(e);process.exitCode=1;});
