const { chromium, launchOptions } = require('./runtime.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../../../..');
const url = "http://127.0.0.1:8765/claude's%20monsters.html";
const results=[];
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name);}
async function seed(page,chapter=null){
  await page.evaluate(chapter=>{const g=__GAME__,G=g.G;G.mode='overworld';G.flags={starter:true,gym:true,pick:2,huntBeaten:1,backstop:false,gymBonus:false};G.party=[g.makeMon('emberling',20),g.makeMon('dripling',16)];G.party[0].hp-=3;G.balls=11;G.materials={stone:8,ore:4,wall:2};G.beaten={test:true};G.picked=new Set(['43,93']);G.chapter=chapter;G.player.tx=42;G.player.ty=10;G.player.px=42*32;G.player.py=10*32;G.player.dir='down';G.steps=99;g.saveGame();},chapter);
}
async function snapshot(page){return page.evaluate(()=>{const G=__GAME__.G;return JSON.stringify({party:G.party,balls:G.balls,flags:G.flags,materials:G.materials,beaten:G.beaten,picked:[...G.picked],edits:G.edits,x:G.player.tx,y:G.player.ty,dir:G.player.dir,steps:G.steps});});}
async function childReady(page){
  await page.waitForSelector('.campaign-chapter iframe');
  const f=page.frames().find(f=>f!==page.mainFrame()&&f.url().includes('embedded=1'));
  assert.ok(f,'embedded frame attached');
  await f.waitForFunction(()=>globalThis.__STATIC__?.debug?.state.ready && __STATIC__.debug.sim,{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('.campaign-status')?.textContent==='');
  return f;
}
async function enter(page,stage=1){await page.evaluate(stage=>__GAME__.campaignHost.enterChapter(stage),stage);return childReady(page);}
(async()=>{
const browser=await chromium.launch(launchOptions);
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url); await page.waitForFunction(()=>globalThis.__GAME__?.campaignHost);
  await check('fresh campaign locked until gym victory',async()=>{
    assert.equal(await page.evaluate(()=>__GAME__.campaignHost.enterChapter(1)),false);
    assert.equal(await page.locator('iframe').count(),0);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>__GAME__.G.flags.gym),false);
  });
  await seed(page);
  await check('victory offers descent, defer keeps trail playable',async()=>{
    await page.evaluate(()=>{__GAME__.G.mode='victory';__GAME__.confirmKey();});
    await page.getByRole('button',{name:'RETURN TO TRAIL',exact:true}).click();
    assert.equal(await page.evaluate(()=>__GAME__.campaignHost.isBusy()),false);
  });
  await check('post-victory menu exposes descent',async()=>{
    await page.evaluate(()=>{__GAME__.cancelKey();__GAME__.G.menu.cursor=5;__GAME__.confirmKey();});
    await page.getByRole('button',{name:'RETURN TO TRAIL',exact:true}).click();
  });
  const original=await snapshot(page);
  let child;
  await check('same-window entry retains campaign and suspends RPG input',async()=>{
    child=await enter(page);
    await page.keyboard.press('ArrowUp');
    assert.equal(await snapshot(page),original);
    assert.equal(await page.locator('iframe').count(),1);
    await page.screenshot({path:path.join(__dirname,'campaign-intake.png')});
  });
  await check('duplicate entry and spoofed messages do not mutate checkpoint',async()=>{
    await page.evaluate(()=>{__GAME__.campaignHost.enterChapter(2);window.postMessage({namespace:'monsterTrail.chapter',v:1,session:'evil',type:'checkpoint',stage:3},'*');});
    assert.equal(await page.locator('iframe').count(),1);
    assert.equal(await page.evaluate(()=>__GAME__.G.chapter.stage),1);
  });
  await check('checkpoint and pause return preserve every RPG field',async()=>{
    await child.evaluate(()=>{__STATIC__.debug.setupStage(2);__STATIC__.debug.play();__STATIC__.debug.pause();});
    await page.waitForFunction(()=>__GAME__.G.chapter.stage===2);
    await child.waitForTimeout(500); // existing overlay guard prevents click-through from the opening gesture
    await child.getByRole('button',{name:'RETURN TO TRAIL',exact:true}).click();
    await page.waitForFunction(()=>!__GAME__.campaignHost.isBusy());
    assert.equal(await snapshot(page),original);
    assert.equal(await page.evaluate(()=>__GAME__.G.chapter.active),true);
    assert.equal(await page.locator('iframe').count(),0);
  });
  await check('refresh and CONTINUE offer the saved descent checkpoint',async()=>{
    await page.reload(); await page.waitForFunction(()=>globalThis.__GAME__?.campaignHost);
    await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
    assert.equal(await page.locator('iframe').count(),0,'Enter opening the dialog must not also activate DESCEND');
    await page.getByRole('button',{name:'RESUME DESCENT · FLOOR 2',exact:true}).click();
    child=await childReady(page);
    assert.equal(await child.evaluate(()=>__STATIC__.debug.state.stage),2);
    await page.locator('.campaign-return').click();
    assert.equal(await snapshot(page),original);
  });
  await check('three enter/return cycles leave one RPG and no child runtime',async()=>{
    for(let i=0;i<3;i++){
      child=await enter(page,2);
      await page.locator('.campaign-return').click();
      assert.equal(await page.locator('iframe').count(),0);
      assert.equal(await snapshot(page),original);
    }
    assert.equal(page.frames().length,1);
    assert.equal(await page.evaluate(()=>__GAME__.campaignHost.isBusy()),false);
  });
  await check('loading failure exposes return without losing trail',async()=>{
    await page.route('**/gemini*',r=>r.abort());
    await page.evaluate(()=>__GAME__.campaignHost.enterChapter(2));
    await page.waitForSelector('.campaign-return');await page.locator('.campaign-return').click();
    assert.equal(await snapshot(page),original);
    await page.unroute('**/gemini*');
  });
  await check('readiness timeout offers retry and recovers one active chapter',async()=>{
    await page.route('**/gemini*',r=>r.abort());
    await page.evaluate(()=>{window.realTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>realTimeout(fn,ms===25000?100:ms,...args);__GAME__.campaignHost.enterChapter(2);});
    await page.getByRole('heading',{name:'The signal is interrupted',exact:true}).waitFor();
    await page.unroute('**/gemini*');
    await page.evaluate(()=>{window.setTimeout=window.realTimeout;});
    await page.getByRole('button',{name:'RETRY',exact:true}).click();child=await childReady(page);
    assert.equal(await page.locator('iframe').count(),1);await page.locator('.campaign-return').click();assert.equal(await snapshot(page),original);
  });
  const cleanErrors=errors.filter(e=>!e.includes('ERR_FAILED')&&!e.includes('ERR_ABORTED'));
  assert.deepEqual(cleanErrors,[],'no unexpected browser errors');
  await page.close();
  const denied=await browser.newPage();
  await denied.goto(url); await denied.waitForFunction(()=>globalThis.__GAME__?.campaignHost);await seed(denied);
  await check('storage denial requires explicit memory-only choice or cancel',async()=>{
    await denied.evaluate(()=>{window.savedStorage=localStorage;Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}});__GAME__.campaignHost.enterChapter(1);});
    assert.equal(await denied.locator('iframe').count(),0);
    await denied.getByRole('button',{name:'STAY ON THE TRAIL',exact:true}).click();
    assert.equal(await denied.evaluate(()=>__GAME__.campaignHost.isBusy()),false);
    assert.equal(await denied.evaluate(()=>__GAME__.G.chapter.active),false);
    await denied.evaluate(()=>__GAME__.campaignHost.enterChapter(1));
    await denied.getByRole('button',{name:'CONTINUE WITHOUT SAVING',exact:true}).click();
    await denied.waitForSelector('iframe');
    const f=denied.frames().find(f=>f!==denied.mainFrame());
    await f.waitForFunction(()=>globalThis.__STATIC__?.debug?.state.ready);
    await denied.evaluate(()=>Object.defineProperty(window,'localStorage',{configurable:true,value:window.savedStorage}));
    await denied.locator('.campaign-return').click();
    assert.equal(await denied.evaluate(()=>__GAME__.G.party[0].id),'emberling');
    assert.ok((await denied.evaluate(()=>__GAME__.G.toast.s)).includes('Checkpoint saved'),'successful storage recovery clears the memory-only warning');
  });
  await denied.close();
  const filePage=await browser.newPage();
  await check('file URL campaign loads locally and returns',async()=>{
    await filePage.goto(pathToFileURL(path.join(ROOT,"claude's monsters.html")).href);
    await filePage.waitForFunction(()=>globalThis.__GAME__?.campaignHost);await seed(filePage);
    await enter(filePage);await filePage.locator('.campaign-return').click();
    assert.equal(await filePage.locator('iframe').count(),0);
  });await filePage.close();
}finally{await browser.close();fs.writeFileSync(path.join(__dirname,'campaign-results.json'),JSON.stringify(results,null,2));}
console.log(results.length+' browser campaign tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
