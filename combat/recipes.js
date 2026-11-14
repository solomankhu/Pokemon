(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MonsterRecipes=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Explicit authored mapping: family, attached implement, originating socket, target.
const definitions={
tackle:['normal','body'],scratch:['normal','claw'],quickattack:['normal','body'],bodyslam:['normal','body'],hyperfang:['normal','fang'],
ember:['fire','mouth'],flameburst:['fire','mouth'],infernofang:['fire','fang'],bubble:['water','mouth'],waterpulse:['water','focus'],aquatail:['water','tail'],
vinewhip:['grass','vine'],razorleaf:['grass','blade'],leafblade:['grass','blade'],energyball:['grass','focus'],
thundershock:['electric','focus'],spark:['electric','body'],thunderbolt:['electric','focus'],rockthrow:['rock','claw'],rockslide:['rock','focus'],
bugbite:['bug','fang'],gust:['wind','wing'],wingattack:['wind','wing'],aerialace:['wind','wing'],poisonsting:['poison','stinger'],sludge:['poison','mouth'],
confusion:['psychic','focus'],psybeam:['psychic','focus'],psychic:['psychic','focus'],growl:['status','mouth'],tailwhip:['status','tail'],leer:['status','focus'],
harden:['status','body','self'],howl:['status','mouth','self'],agility:['psychic','body','self'],stringshot:['bug','mouth'],bite:['dark','fang'],crunch:['dark','fang'],snarl:['dark','mouth'],nightveil:['dark','focus'],
metalclaw:['steel','claw'],irontail:['steel','tail'],flashcannon:['steel','focus'],ironguard:['steel','body','self'],brinejet:['water','mouth'],sandsting:['rock','stinger'],dazzle:['psychic','focus']};
const statuses=new Set(['growl','tailwhip','leer','harden','howl','agility','stringshot','nightveil','ironguard','dazzle']);
const physical=new Set(['tackle','scratch','quickattack','bodyslam','hyperfang','infernofang','aquatail','vinewhip','leafblade','spark','bugbite','wingattack','aerialace','poisonsting','bite','crunch','metalclaw','irontail','sandsting']);
const RECIPES={};Object.keys(definitions).forEach((id)=>{const [family,weapon,target]=definitions[id];const windup=id==='quickattack'?.18:.34,travel=physical.has(id)?.3:.48,contact=.18,recovery=.34;RECIPES[id]=Object.freeze({id,family,weapon,emitter:weapon,target:target||'foe',physical:physical.has(id),status:statuses.has(id),windup,travel,contact,recovery,contactAt:windup+travel,duration:windup+travel+contact+recovery,sound:family+'-'+weapon});});Object.freeze(RECIPES);
function recipeFor(id){if(!RECIPES[id])throw new Error('Unknown combat move: '+id);return RECIPES[id];}
function sampleAction(action,elapsed){const r=action.moveId?recipeFor(action.moveId):action;const duration=action.duration||r.duration;const scale=duration/r.duration;const t=Math.max(0,Number(elapsed)||0)/scale;let phase='done',progress=1;if(t<r.windup){phase='windup';progress=t/r.windup;}else if(t<r.contactAt){phase='travel';progress=(t-r.windup)/r.travel;}else if(t<r.contactAt+r.contact){phase='contact';progress=(t-r.contactAt)/r.contact;}else if(t<r.duration){phase='recovery';progress=(t-r.contactAt-r.contact)/r.recovery;}return {phase,progress:Math.max(0,Math.min(1,progress)),elapsed:t,duration,contact:t>=r.contactAt,done:phase==='done'};}
return {RECIPES,recipeFor,sampleAction};});
