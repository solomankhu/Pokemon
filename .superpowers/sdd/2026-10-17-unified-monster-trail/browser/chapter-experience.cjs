const {chromium,launchOptions}=require('./runtime.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const URL="http://127.0.0.1:8765/claude's%20monsters.html";
const results=[];
async function test(name,fn){await fn();results.push(name);console.log('PASS '+name);}
async function prepare(page){await page.goto(URL);await page.waitForFunction(()=>globalThis.__GAME__?.campaignHost);await page.evaluate(()=>{const g=__GAME__,G=g.G;G.flags={gym:true,starter:true};G.party=[g.makeMon('emberling',20)];G.mode='overworld';G.chapter=null;g.saveGame();});}
async function enter(page,stage=1){await page.evaluate(n=>__GAME__.campaignHost.enterChapter(n),stage);await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow);const f=page.frames().find(f=>f!==page.mainFrame());await f.waitForFunction(()=>globalThis.__STATIC__?.debug?.state.ready);await page.waitForFunction(()=>document.querySelector('.campaign-status')?.textContent==='');return f;}
async function completeFloor(f){await f.evaluate(()=>{const S=__STATIC__,sim=S.debug.sim;sim.enemies.forEach(e=>e.stunnedTimer=100000);for(const t of sim.terminals){sim.player.x=t.x;sim.player.z=t.z;S.stepSim(sim,{mx:0,mz:0});}});}
(async()=>{const browser=await chromium.launch(launchOptions);try{
  const p=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await prepare(p);let f=await enter(p);
  await test('protected arrival and real keyboard doorway movement',async()=>{
    await f.evaluate(()=>{__STATIC__.debug.play();__STATIC__.debug.sim.player.oxy=75;});
    await f.waitForTimeout(200);
    assert.equal(await f.evaluate(()=>__STATIC__.debug.sim.player.oxy),75);
    await p.locator('iframe').focus();await p.keyboard.down('w');await f.waitForFunction(()=>__STATIC__.debug.sim.player.z<30.5);await p.keyboard.up('w');
    assert.ok(await f.evaluate(()=>!__STATIC__.overlapsWall(__STATIC__.debug.sim.player.x,__STATIC__.debug.sim.player.z,__STATIC__.PLAYER_RADIUS,__STATIC__.debug.sim.cfg.walls)));
    assert.equal(await p.evaluate(()=>__GAME__.G.steps),0);
  });
  await test('floor plan labels, current room, controls and reduced motion',async()=>{
    await f.evaluate(()=>__STATIC__.debug.pause());await f.waitForTimeout(450);
    await f.getByRole('button',{name:'FLOOR PLAN',exact:true}).click();
    assert.ok((await f.locator('#floor-plan').getAttribute('aria-label')).includes('PUMP ROOM'));
    await p.screenshot({path:path.join(__dirname,'intake-floor-plan.png')});
    await p.keyboard.press('Escape');assert.equal(await f.locator('#floor-plan').count(),0);
    assert.equal(await f.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
  });
  await test('all three floors progress through terminals and persist final completion',async()=>{
    await completeFloor(f);
    await f.waitForFunction(()=>__STATIC__.debug.state.stage===2);await p.waitForFunction(()=>__GAME__.G.chapter.stage===2);
    await f.evaluate(()=>{__STATIC__.debug.play();__STATIC__.debug.overhead(true);});
    await f.waitForTimeout(80);await p.screenshot({path:path.join(__dirname,'archives-overhead.png')});
    await completeFloor(f);await f.waitForFunction(()=>__STATIC__.debug.state.stage===3);await p.waitForFunction(()=>__GAME__.G.chapter.stage===3);
    await f.evaluate(()=>{__STATIC__.debug.play();__STATIC__.debug.overhead(true);});await f.waitForTimeout(80);
    await p.screenshot({path:path.join(__dirname,'signal-core-overhead.png')});
    await completeFloor(f);await f.waitForFunction(()=>__STATIC__.debug.state.status==='won');await p.waitForFunction(()=>__GAME__.G.chapter.completed===true);
    await f.waitForTimeout(450);await f.getByRole('button',{name:'RETURN TO TRAIL',exact:true}).click();await p.waitForFunction(()=>!__GAME__.campaignHost.isBusy());
    assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('monster-trail-save-v1')).chapter.completed),true);
    assert.equal(await p.evaluate(()=>__GAME__.G.party[0].id),'emberling');
    await p.screenshot({path:path.join(__dirname,'campaign-return.png')});
  });
  await test('replay starts stage 1 and preserves prior completion',async()=>{
    await p.evaluate(()=>__GAME__.campaignHost.showChapterMenu());await p.getByRole('button',{name:'REPLAY THE STATIC BELOW',exact:true}).click();
    f=p.frames().find(f=>f!==p.mainFrame());await f.waitForFunction(()=>globalThis.__STATIC__?.debug?.state.ready);
    await p.waitForFunction(()=>document.querySelector('.campaign-status')?.textContent==='');
    assert.equal(await f.evaluate(()=>__STATIC__.debug.state.stage),1);assert.equal(await p.evaluate(()=>__GAME__.G.chapter.completed),true);
    await p.locator('.campaign-return').click();
  });
  await test('death return preserves the unfinished checkpoint',async()=>{
    f=await enter(p,1);await f.evaluate(()=>{const S=__STATIC__,s=S.debug.sim;s.player.x=0;s.player.z=28;s.player.oxy=0;S.stepSim(s,{mx:0,mz:0});});
    await f.waitForFunction(()=>__STATIC__.debug.state.status==='dead');await f.waitForTimeout(450);
    await f.getByRole('button',{name:'RETURN TO TRAIL',exact:true}).click();await p.waitForFunction(()=>!__GAME__.campaignHost.isBusy());
    assert.equal(await p.evaluate(()=>__GAME__.G.chapter.active),true);assert.equal(await p.evaluate(()=>__GAME__.G.chapter.stage),1);
  });
  await test('new game clears old chapter progress',async()=>{
    await p.reload();await p.waitForFunction(()=>globalThis.__GAME__?.campaignHost);await p.keyboard.press('Enter');
    assert.equal(await p.evaluate(()=>__GAME__.G.newGameConfirm),true,'existing save requires explicit new-game confirmation');
    assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('monster-trail-save-v1')).chapter.active),true,'opening confirmation preserves chapter progress');
    await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');
    assert.equal(await p.evaluate(()=>__GAME__.G.chapter.completed),false);assert.equal(await p.evaluate(()=>__GAME__.G.chapter.unlocked),false);
    assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('monster-trail-save-v1')).chapter.active),false);
  });
  assert.deepEqual(errors,[],'desktop no page errors');await p.close();
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const mobile=await context.newPage(),mobileErrors=[];mobile.on('pageerror',e=>mobileErrors.push(e.message));mobile.on('console',m=>{if(m.type()==='error')mobileErrors.push(m.text());});await prepare(mobile);f=await enter(mobile);
  await test('touch begin, flashlight, pulse, pause and plan controls',async()=>{
    assert.equal(await f.evaluate(()=>__STATIC__.debug.state.touchMode),true);
    await f.getByRole('button',{name:'BEGIN',exact:true}).tap();await f.waitForFunction(()=>__STATIC__.debug.state.overlayHidden);
    const cdp=await context.newCDPSession(mobile);
    const startZ=await f.evaluate(()=>__STATIC__.debug.sim.player.z);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:100,y:290}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:100,y:230}]});
    await f.waitForFunction(z=>__STATIC__.debug.sim.player.z<z-0.2,startZ);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const startYaw=await f.evaluate(()=>__STATIC__.debug.look.yaw);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:600,y:190}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:650,y:190}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.notEqual(await f.evaluate(()=>__STATIC__.debug.look.yaw),startYaw,'touch look changes camera direction');
    await f.locator('[data-act=flashlight]').tap();assert.equal(await f.evaluate(()=>__STATIC__.debug.sim.player.flashlightOn),false);
    await f.locator('[data-act=pulse]').tap();assert.ok(await f.evaluate(()=>__STATIC__.debug.sim.player.battery<100));
    await f.locator('#tb-pause').tap();await f.waitForTimeout(450);await f.getByRole('button',{name:'FLOOR PLAN',exact:true}).tap();
    await mobile.screenshot({path:path.join(__dirname,'touch-floor-plan.png')});
    const bounds=await f.locator('#floor-plan').boundingBox();assert.ok(bounds.width>50&&bounds.height>50);
    const titleBounds=await f.locator('#overlay-title').boundingBox();assert.ok(titleBounds.y>=0,'floor-plan title must fit the short landscape viewport');
    assert.ok(await f.locator('#floor-plan-legend').isVisible(),'room names must remain readable beside the scaled floor plan');
    await f.getByRole('button',{name:'RETURN TO TRAIL',exact:true}).tap();await mobile.waitForFunction(()=>!__GAME__.campaignHost.isBusy());
    assert.equal(await mobile.locator('iframe').count(),0);
    await mobile.screenshot({path:path.join(__dirname,'touch-return.png')});
  });
  await test('portrait touch map and return remain usable',async()=>{
    await mobile.setViewportSize({width:390,height:844});f=await enter(mobile);
    await f.evaluate(()=>{__STATIC__.debug.play();__STATIC__.debug.pause();});await f.waitForTimeout(450);
    await f.getByRole('button',{name:'FLOOR PLAN',exact:true}).tap();
    await mobile.screenshot({path:path.join(__dirname,'touch-portrait-map.png')});
    assert.ok(await f.locator('#floor-plan-legend').isVisible());
    assert.equal(await f.locator('#rotate-hint').isVisible(),false,'rotation hint must not cover paused map content');
    const title=await f.locator('#overlay-title').boundingBox(),back=await mobile.locator('.campaign-return').boundingBox();
    assert.ok(back.y+back.height<=title.y||back.x>=title.x+title.width||back.x+back.width<=title.x,'campaign return control must not overlap the chapter title');
    await f.getByRole('button',{name:'RETURN TO TRAIL',exact:true}).tap();await mobile.waitForFunction(()=>!__GAME__.campaignHost.isBusy());
    assert.equal(await mobile.locator('iframe').count(),0);
  });
  assert.deepEqual(mobileErrors,[],'touch no page errors');await context.close();
}finally{await browser.close();fs.writeFileSync(path.join(__dirname,'experience-results.json'),JSON.stringify(results,null,2));}console.log(results.length+' experience tests passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
