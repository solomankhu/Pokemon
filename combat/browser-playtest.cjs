'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
function findPlaywright(){
 for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright','@playwright/test'].filter(Boolean))try{return require(candidate);}catch(_){}
 const cache=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'npm-cache','_npx');
 if(fs.existsSync(cache))for(const d of fs.readdirSync(cache))try{return require(path.join(cache,d,'node_modules','playwright'));}catch(_){}
 throw Error('Install Playwright or set PLAYWRIGHT_MODULE to its installed package path.');
}
const {chromium}=findPlaywright(),root=path.join(__dirname,'..'),out=path.join(root,'.superpowers/sdd/2026-10-17-3d-combat/browser');
function executable(){
 if(process.env.BROWSER_EXECUTABLE)return process.env.BROWSER_EXECUTABLE;
 if(fs.existsSync(chromium.executablePath()))return chromium.executablePath();
 const cache=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'ms-playwright');
 if(fs.existsSync(cache))for(const d of fs.readdirSync(cache).filter(d=>/^chromium-/.test(d)).sort().reverse())for(const relative of ['chrome-win64/chrome.exe','chrome-linux/chrome','chrome-mac/Chromium.app/Contents/MacOS/Chromium']){const p=path.join(cache,d,relative);if(fs.existsSync(p))return p;}
 throw Error('No installed Chromium found; set BROWSER_EXECUTABLE.');
}
fs.mkdirSync(out,{recursive:true});
const gameUrl=process.env.GAME_URL||pathToFileURL(path.join(root,"claude's monsters.html")).href;
const report={tests:[],errors:[],performance:[],screenshots:[]};let browser;
async function test(name,fn){await fn();report.tests.push(name);console.log('PASS '+name);}
async function shot(page,name){await page.screenshot({path:path.join(out,name+'.png')});report.screenshots.push(name+'.png');}
async function readyCommand(page){await page.waitForFunction(()=>__GAME__.G.battle.command);if(await page.evaluate(()=>!__GAME__.G.battle.command.ready))await page.keyboard.press('z');}
async function seed(page,mine='emberling',foe='thornmane',arena='meadow'){
 await page.evaluate(({mine,foe,arena})=>{const g=__GAME__,G=g.G;G.mode='overworld';G.flags={starter:true,gym:true};G.party=[g.makeMon(mine,25)];G.settings={actionMode:'ON',quality:'STANDARD',reducedMotion:false,basicMode:false};g.startBattle(g.makeMon(foe,25));const b=G.battle;b.queue=[];b.step=null;b.phase='menu';b.arena=arena;b.hiddenMine=false;b.hiddenFoe=false;}, {mine,foe,arena});
 await page.waitForFunction(()=>__GAME__.battleHost?.is3D(),{timeout:30000});
}
async function freezeMove(page,moveId,elapsed,actor='mine',result={missed:false,eff:1,crit:false,dmg:10}){
 await page.evaluate(({moveId,elapsed,actor,result})=>{const g=__GAME__,b=g.G.battle,r=MonsterRecipes.recipeFor(moveId);b.queue=[];b.step={t:'msg',s:moveId.toUpperCase()+' - VISUAL CHECK'};b.action={id:Date.now()+Math.random(),actor,target:actor==='mine'?'foe':'mine',moveId,result,duration:r.duration,contactAt:r.contactAt,elapsed};g.battleHost.presenter.play(b.action);g.battleHost.presenter.sync(g.battleSnapshot());g.battleHost.presenter.update(0);g.battleHost.presenter.render();}, {moveId,elapsed,actor,result});
}
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:executable()});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(gameUrl);await page.waitForFunction(()=>globalThis.__GAME__?.battleHost);
  await test('live 3D arena with articulated fighters',async()=>{
   await seed(page);assert.equal(await page.evaluate(()=>__GAME__.battleHost.presenter.diagnostics.models),2);await shot(page,'battle-3d-meadow');
  });
  await test('1 vs 1 trainer replacement waits until the knockout and send-out',async()=>{
   await seed(page,'zapmote','sprigling');
   await page.evaluate(()=>{const g=__GAME__,b=g.G.battle;window.outgoingFoe=g.battleHost.presenter.view.rigs.foe.root;b.foe.hp=b.dispFoe=1;b.trainer={id:'duel-test',name:'Duel Trainer',team:[['sprigling',5],['dripling',5]],defeat:'Well played.'};g.G.settings.actionMode='AUTO';g.takeTurn(b,{t:'attack',move:'thunderbolt'});});
   for(let i=0;i<150;i++){
    if(await page.evaluate(()=>__GAME__.G.battle.teamIdx===1))break;
    if(await page.evaluate(()=>{const b=__GAME__.G.battle;return b.step?.t==='msg'||b.command&&!b.command.ready;}))await page.keyboard.press('z');
    await page.waitForTimeout(60);
   }
   await page.waitForFunction(()=>__GAME__.G.battle.teamIdx===1&&__GAME__.battleHost.presenter.view.rigs.foe.root.name==='dripling');
   assert.equal(await page.evaluate(()=>__GAME__.battleSnapshot().foe.visible),false,'replacement hidden during announcement');
   assert.equal(await page.evaluate(()=>window.outgoingFoe.parent===null),true,'knocked-out creature removed');await shot(page,'one-v-one-replacement-waits');
   await page.keyboard.press('z');await page.waitForFunction(()=>__GAME__.G.battle.phase==='menu');
   assert.ok(await page.evaluate(()=>{const p=__GAME__.battleHost.presenter;return p.diagnostics.models===2&&p.view.rigs.mine.root.visible&&p.view.rigs.foe.root.visible&&window.outgoingFoe.parent===null;}));
   await shot(page,'one-v-one-replacement-active');await seed(page);
  });
  await test('Pickajoo starter and visible Thunder attack',async()=>{
   await page.evaluate(()=>{const g=__GAME__;g.G.mode='starter';g.G.party=[];g.G.flags={starter:false,gym:false};g.G.starterCursor=0;});
   await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>__GAME__.STARTERS[__GAME__.G.starterCursor]),'zapmote');await shot(page,'pickajoo-starter');
   await page.keyboard.press('z');assert.equal(await page.evaluate(()=>__GAME__.G.party[0].name),'PICKAJOO');assert.ok(await page.evaluate(()=>__GAME__.G.party[0].moves.includes('thunderbolt')));
   await seed(page,'zapmote','tidewhisk','shore');
   await freezeMove(page,'thunderbolt',.6,'mine');await shot(page,'pickajoo-thunder-travel');
   await freezeMove(page,'thunderbolt',1,'mine');await page.waitForTimeout(120);await shot(page,'pickajoo-thunder-impact');
   await seed(page);
  });
  await test('guided Attack/Defend choices wait for confirmation and readiness',async()=>{
   await seed(page);await page.evaluate(()=>{const b=__GAME__.G.battle;b.foe.moves=['tackle'];__GAME__.G.settings.actionMode='AUTO';});
   await page.keyboard.press('z');await page.keyboard.press('z');
   assert.equal(await page.evaluate(()=>__GAME__.G.battle.phase),'choice');await shot(page,'attack-choice-guide');await page.waitForTimeout(250);
   assert.equal(await page.evaluate(()=>__GAME__.G.battle.action),null);
   await page.keyboard.press('x');await page.keyboard.press('x');await page.keyboard.press('ArrowRight');await page.keyboard.press('z');
   assert.equal(await page.evaluate(()=>__GAME__.G.battle.pendingChoice.t),'defend');await shot(page,'defense-choice-guide');
   await page.keyboard.press('z');await page.waitForFunction(()=>__GAME__.G.battle.step?.t==='msg');await page.keyboard.press('z');await page.waitForFunction(()=>__GAME__.G.battle.command?.kind==='guard');
   await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>__GAME__.G.battle.command.elapsed),0);await shot(page,'defense-ready-guide');
   await readyCommand(page);await page.waitForFunction(()=>__GAME__.G.battle.step?.t==='msg');await page.keyboard.press('z');await page.waitForFunction(()=>__GAME__.G.battle.action?.moveId==='tackle');
   assert.ok(await page.evaluate(()=>__GAME__.G.battle.action.duration>1.6));assert.equal(await page.evaluate(()=>__GAME__.G.battle.action.guardTier),'GUARD');
   await seed(page);
  });
  await test('visible fire and wind moves in both directions',async()=>{
   for(const [move,side] of [['flameburst','mine'],['gust','foe'],['metalclaw','mine'],['leafblade','mine'],['aquatail','foe'],['thunderbolt','mine'],['vinewhip','mine']]){
    const elapsed=await page.evaluate(id=>{const r=MonsterRecipes.recipeFor(id);return r.windup+r.travel*.55;},move);await freezeMove(page,move,elapsed,side);await shot(page,'action-'+move+'-'+side);
   }
  });
  await test('every move recipe renders in both directions without errors',async()=>{
   const moves=await page.evaluate(()=>Object.keys(__GAME__.MOVES));
   for(const move of moves)for(const actor of ['mine','foe']){
    const elapsed=await page.evaluate(id=>MonsterRecipes.recipeFor(id).contactAt-.07,move);await freezeMove(page,move,elapsed,actor);
   }
   assert.equal(moves.length,47);
  });
  await test('every species builds in live 3D and has a reference frame',async()=>{
   const ids=await page.evaluate(()=>Object.keys(__GAME__.SPECIES));
   for(const id of ids){await page.evaluate(id=>{const g=__GAME__,b=g.G.battle;b.mine=g.makeMon(id,25);b.dispMine=b.mine.hp;b.action=null;b.step={t:'msg',s:id.toUpperCase()};g.battleHost.presenter.sync(g.battleSnapshot());},id);await shot(page,'species-'+id);}
   assert.equal(ids.length,26);
  });
  await test('all five regional arenas and hunt presentation',async()=>{
   for(const arena of ['meadow','shore','pass','ruins','cave']){await page.evaluate(a=>{const g=__GAME__;g.G.battle.arena=a;g.G.battle.hunt=a==='cave';},arena);await page.waitForFunction(a=>__GAME__.battleHost.presenter.diagnostics.arena===a,arena);await shot(page,'arena-'+arena);}
   await page.evaluate(()=>__GAME__.G.battle.hunt=false);
  });
  await test('actual strike and hold/release command input',async()=>{
   await page.evaluate(()=>{const g=__GAME__,b=g.G.battle;b.queue=[];b.step=null;b.action=null;g.qCommand(b,'strike',r=>{b.testResult=r;});});
   await readyCommand(page);await page.waitForFunction(()=>__GAME__.G.battle.command?.elapsed>=.6);await page.keyboard.press('z');
   await page.waitForFunction(()=>__GAME__.G.battle.testResult);
   assert.ok(await page.evaluate(()=>['GOOD','PERFECT'].includes(__GAME__.G.battle.testResult?.tier)));
   await page.evaluate(()=>{const g=__GAME__,b=g.G.battle;b.testResult=null;b.queue=[];b.step=null;g.qCommand(b,'charge',r=>b.testResult=r);});
   await readyCommand(page);await page.waitForFunction(()=>__GAME__.G.battle.command?.kind==='charge');await page.keyboard.down('z');
   await readyCommand(page);await page.waitForFunction(()=>__GAME__.G.battle.command?.elapsed>=.78);await page.keyboard.up('z');await page.waitForFunction(()=>__GAME__.G.battle.testResult);
   assert.ok(await page.evaluate(()=>['GOOD','PERFECT'].includes(__GAME__.G.battle.testResult.tier)));
  });
  await test('touch guard and focus-pause require fresh command input',async()=>{
   await page.evaluate(()=>{const g=__GAME__,b=g.G.battle;b.testResult=null;b.queue=[];b.step=null;g.qCommand(b,'guard',r=>b.testResult=r);});
   await readyCommand(page);await page.waitForFunction(()=>__GAME__.G.battle.command?.elapsed>=.5);
   assert.equal(await page.evaluate(()=>__GAME__.battleHost.presenter.view.shield.visible),true);
   const box=await page.locator('#btnA').boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
   await page.waitForFunction(()=>__GAME__.G.battle.testResult);assert.ok(await page.evaluate(()=>['GUARD','PERFECT'].includes(__GAME__.G.battle.testResult.tier)));
   await page.evaluate(()=>{const g=__GAME__,b=g.G.battle;b.testResult=null;b.queue=[];b.step=null;g.qCommand(b,'catch',r=>b.testResult=r);});
   await readyCommand(page);await page.waitForFunction(()=>__GAME__.G.battle.command?.elapsed>.1);await page.keyboard.down('z');
   await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   const at=await page.evaluate(()=>__GAME__.G.battle.command.elapsed);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>__GAME__.G.battle.command.elapsed),at);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.keyboard.up('z');await page.evaluate(()=>new Promise(requestAnimationFrame));await page.keyboard.down('z');
   await readyCommand(page);await page.waitForFunction(()=>__GAME__.G.battle.command?.elapsed>=.9);await page.keyboard.up('z');await page.waitForFunction(()=>__GAME__.G.battle.testResult);
   assert.ok(await page.evaluate(()=>['GREAT','EXCELLENT'].includes(__GAME__.G.battle.testResult.tier)));
  });
  await test('successful defense shows a shield at incoming contact',async()=>{
   await freezeMove(page,'tackle',.65,'foe');
   await page.evaluate(()=>{const b=__GAME__.G.battle;b.action.guardTier='PERFECT';const p=__GAME__.battleHost.presenter;p.play(b.action);p.sync(__GAME__.battleSnapshot());p.update(0);p.render();});
   assert.equal(await page.evaluate(()=>__GAME__.battleHost.presenter.view.shield.visible),true);await shot(page,'defense-perfect-shield');
   await page.evaluate(()=>{const b=__GAME__.G.battle;b.action=null;b.step=null;});
  });
  await test('elemental explosions and creature/team defeat effects',async()=>{
   await seed(page);
   for(const moveId of ['flameburst','thunderbolt','waterpulse','gust','tackle']){
    const at=await page.evaluate(id=>MonsterRecipes.recipeFor(id).contactAt+.18,moveId);await freezeMove(page,moveId,at,'mine');await page.waitForTimeout(140);
    assert.equal(await page.evaluate(()=>__GAME__.battleHost.presenter.view.effects.diagnostics.impacts),1);await shot(page,'impact-'+moveId);
   }
   await page.evaluate(()=>{const g=__GAME__,b=g.G.battle;b.action={id:'defeat-vfx',kind:'faint',actor:'foe',duration:.65,elapsed:.3};const p=g.battleHost.presenter;p.play(b.action);p.sync(g.battleSnapshot());p.update(0);p.render();});
   assert.equal(await page.evaluate(()=>__GAME__.battleHost.presenter.view.effects.diagnostics.defeats),1);await shot(page,'defeated-creature');
   await page.evaluate(()=>{const b=__GAME__.G.battle;b.action=null;b.result='lose';b.phase='over';b.step=null;});await shot(page,'team-defeated');
   await page.evaluate(()=>{const b=__GAME__.G.battle;b.result=null;b.phase='menu';});
  });
  await test('quality and accessibility settings rebuild safely',async()=>{
   await page.getByRole('button',{name:'Battle settings',exact:true}).click();
   await page.getByLabel('Action commands').selectOption('AUTO');await page.getByLabel('Effects quality').selectOption('LOW');
   await page.getByLabel('Reduced motion').check();await page.getByRole('button',{name:'Apply settings',exact:true}).click();await page.getByRole('button',{name:'Close',exact:true}).click();
   await page.waitForFunction(()=>__GAME__.battleHost.is3D());assert.equal(await page.evaluate(()=>__GAME__.G.settings.actionMode),'AUTO');
   await shot(page,'battle-low-reduced-motion');
  });
  await test('context loss pauses contact and Basic presentation resumes it exactly once',async()=>{
   await page.evaluate(()=>{const g=__GAME__,b=g.G.battle;b.queue=[];b.step=null;b.action=null;b.contacts=0;g.qAction(b,{id:'loss-contact',actor:'mine',moveId:'ember',duration:3,contactAt:2},()=>b.contacts++);});
   await page.waitForFunction(()=>__GAME__.G.battle.action?.elapsed>.1);
   await page.evaluate(()=>{const c=Array.from(document.querySelectorAll('canvas')).find(c=>c!==document.getElementById('game')&&c.parentElement.style.pointerEvents==='none');c.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));});
   await page.getByRole('dialog',{name:'3D presentation unavailable'}).waitFor();
   const before=await page.evaluate(()=>__GAME__.G.battle.action.elapsed);await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>__GAME__.G.battle.action.elapsed),before);
   await page.getByRole('button',{name:'BASIC PRESENTATION',exact:true}).click();
   await page.waitForFunction(()=>__GAME__.G.battle.contacts===1);await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>__GAME__.G.battle.contacts),1);await shot(page,'context-loss-basic-resumed');
   await page.getByRole('button',{name:'Battle settings',exact:true}).click();
   await page.getByLabel('Basic presentation (2D)').uncheck();await page.getByLabel('Effects quality').selectOption('STANDARD');await page.getByLabel('Reduced motion').uncheck();
   await page.getByRole('button',{name:'Apply settings',exact:true}).click();await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForFunction(()=>__GAME__.battleHost.is3D());
  });
  await test('hunt darkness and reveal use the live 3D arena',async()=>{
   await seed(page,'emberling','gloomstalk','cave');
   await page.evaluate(()=>{const b=__GAME__.G.battle;b.hunt=true;b.scare='dark';b.step={t:'msg',s:'Something moves in the dark...'};});await shot(page,'hunt-dark-3d');
   await page.evaluate(()=>{const b=__GAME__.G.battle;b.scare='reveal';b.scareFlash=.12;});await shot(page,'hunt-reveal-3d');
   await page.evaluate(()=>{const b=__GAME__.G.battle;b.hunt=false;b.scare=null;b.scareFlash=0;});
  });
  await test('twenty battles reuse one renderer and leave exploration clean',async()=>{
   for(let i=0;i<20;i++){
    await page.evaluate(()=>{__GAME__.G.mode='overworld';__GAME__.G.battle=null;});await page.waitForFunction(()=>!__GAME__.battleHost.diagnostics.active);
    await seed(page,i%2?'dripling':'emberling',i%2?'galebeak':'thornmane',i%2?'shore':'meadow');
    assert.equal(await page.evaluate(()=>__GAME__.battleHost.presenter.diagnostics.rendererCount),1);
   }
  });
  await test('standard rendering performance sample',async()=>{
   assert.equal(await page.evaluate(()=>__GAME__.G.settings.quality),'STANDARD');
   await freezeMove(page,'flameburst',.6,'mine');
   const stats=await page.evaluate(async()=>{const samples=[],cpu=[];let last=performance.now();for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);const now=performance.now();samples.push(now-last);last=now;const start=performance.now();__GAME__.battleHost.presenter.render();cpu.push(performance.now()-start);}const percentile=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];return {userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],frameMedian:percentile(samples,.5),frameP95:percentile(samples,.95),cpuMedian:percentile(cpu,.5),cpuP95:percentile(cpu,.95),slowFrames:samples.filter(n=>n>33.4).length};});report.performance.push(stats);console.log('PERFORMANCE '+JSON.stringify(stats));
  });
  await test('lifecycle events render and completed evolution keeps its rig',async()=>{
   await seed(page);
   for(const kind of ['throw','catch','faint','sendout','evolve','escape']){
    await page.evaluate(kind=>{const g=__GAME__,b=g.G.battle;b.step={t:'msg',s:kind.toUpperCase()};b.queue=[];b.action={id:'lifecycle-'+kind,kind,actor:'mine',target:'foe',into:'pyrelash',duration:1.6,elapsed:.95,result:{caught:true,shakes:3}};},kind);
    await shot(page,'lifecycle-'+kind);
   }
  });
  await test('three 3D battle to underground and return cycles preserve the party',async()=>{
   for(let i=0;i<3;i++){
    await seed(page);await page.evaluate(()=>{__GAME__.G.mode='overworld';__GAME__.G.battle=null;});
    await page.waitForFunction(()=>!__GAME__.battleHost.diagnostics.active);
    const before=await page.evaluate(()=>JSON.stringify(__GAME__.G.party));
    await page.evaluate(()=>__GAME__.campaignHost.enterChapter(1));
    await page.waitForSelector('.campaign-chapter iframe');await page.locator('.campaign-return').click();
    await page.waitForFunction(()=>!__GAME__.campaignHost.isBusy());
    assert.equal(await page.evaluate(()=>JSON.stringify(__GAME__.G.party)),before);
    assert.equal(await page.locator('iframe').count(),0);
   }
  });
  await test('26-species contact sheet',async()=>{
   const sheet=await browser.newPage({viewport:{width:1600,height:1440}});await sheet.goto(gameUrl);
   const ids=await page.evaluate(()=>Object.keys(__GAME__.SPECIES));
   await sheet.setContent('<body style="margin:0;background:#111;color:white;display:grid;grid-template-columns:repeat(5,320px);font:14px monospace">'+ids.map(id=>'<div>'+id+'<img style="display:block;width:320px" src="'+pathToFileURL(path.join(out,'species-'+id+'.png')).href+'"></div>').join('')+'</body>');
   await sheet.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth));await shot(sheet,'species-contact-sheet');await sheet.close();
  });
  await page.close();
 }finally{if(browser)await browser.close();fs.writeFileSync(path.join(out,'combat-browser-results.json'),JSON.stringify(report,null,2));}
 assert.deepEqual(report.errors,[],'browser has no unexpected errors');console.log(report.tests.length+' 3D browser scenarios passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});


