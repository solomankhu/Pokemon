(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MonsterArenas=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 /* Battle scene (shell only). scene = {layout (uint32), time, weather, camera}, from the html battleSnapshot().
    layout 0 = no jitter = the pre-conditions arena exactly. All variation is its own mulberry32, never the global random. */
 const DEFAULT_SCENE=Object.freeze({layout:0,time:'day',weather:'none',camera:0});
 const TIMES=['day','dusk','dawn','night'],WEATHERS=['none','rain','sun','fog','dust','sparks','leaves','snow','motes'];
 // hemi/key: intensities; keyColor/hemiSky: light colours; sky: scene.background (null = the renderer clear colour); fog: T.Fog colour.
 const TIME_LIGHT=Object.freeze({
  day:Object.freeze({hemi:1.1,key:1.2,keyColor:0xffe9c6,hemiSky:0xc4e9ff,sky:null,fog:0x253c46}),
  dusk:Object.freeze({hemi:.85,key:1.0,keyColor:0xff9a5a,hemiSky:0xf0b890,sky:0x3a2632,fog:0x4a3440}),
  dawn:Object.freeze({hemi:.95,key:1.0,keyColor:0xffc2b4,hemiSky:0xe6c6e2,sky:0x363048,fog:0x4a4258}),
  night:Object.freeze({hemi:.55,key:.55,keyColor:0x8fa8ff,hemiSky:0x6f88c8,sky:0x0a1322,fog:0x111c2c})});
 const CAVE_TIME_WEIGHT=.4;   // the cave keeps its own colours; time scales its light only this much
 const SUN_KEY=1.25;          // sun weather: key light multiplier
 const FOG_DEFAULT=Object.freeze({color:0x253c46,near:14,far:32});
 const FOG_WEATHER=Object.freeze({near:6,far:24,mix:.35,toward:0x8a9aa0});   // fog weather pulls the fog in and greys it
 const JITTER_X=1.6,JITTER_Z=1.2,JITTER_SCALE_MIN=.8,JITTER_SCALE_SPAN=.45,CLAMP_X=9;
 const CLEAR_BOX=Object.freeze({x0:-5.2,x1:5.2,z0:-3.4,z1:2.4}),CLEAR_PAD=.05;   // the band between the camera and both platforms
 const WEATHER_MAX=Object.freeze({HIGH:600,STANDARD:300,LOW:120});
 const WEATHER_BOX=Object.freeze({x0:-9,x1:9,y0:0,y1:7,z0:-6,z1:6});
 const WEATHER_STYLE=Object.freeze({
  rain:{color:0x9fc8ff,size:.09,opacity:.75,share:1},snow:{color:0xffffff,size:.1,opacity:.9,share:.6},
  leaves:{color:0xffffff,size:.14,opacity:.9,share:.25,colors:[0x6fa24a,0xd9802e]},dust:{color:0xc8a878,size:.08,opacity:.55,share:.5},
  sparks:{color:0x9ffaff,size:.11,opacity:.95,share:.3},motes:{color:0xf2ecc8,size:.07,opacity:.6,share:.3}});
 function mulberry(a){a=a>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
 function normalizeScene(s){s=s&&typeof s==='object'?s:{};const layout=Number.isFinite(s.layout)&&s.layout>=0?Math.floor(s.layout)>>>0:0;
  return {layout,time:TIMES.includes(s.time)?s.time:'day',weather:WEATHERS.includes(s.weather)?s.weather:'none',camera:Number.isInteger(s.camera)&&s.camera>=0&&s.camera<4?s.camera:0};}
 function mixHex(a,b,t){const c=(s)=>Math.round(((a>>s)&255)*(1-t)+((b>>s)&255)*t);return (c(16)<<16)|(c(8)<<8)|c(0);}
 // Scene-wide look (fog, background) for the presenter to apply; buildArena owns only meshes, lights and particles.
 function sceneLook(kind,scene){const sc=normalizeScene(scene),t=TIME_LIGHT[sc.time];const fog={color:t.fog,near:FOG_DEFAULT.near,far:FOG_DEFAULT.far};
  if(sc.weather==='fog'){fog.near=FOG_WEATHER.near;fog.far=FOG_WEATHER.far;fog.color=mixHex(t.fog,FOG_WEATHER.toward,FOG_WEATHER.mix);return {fog,background:fog.color};}   // the sky dissolves into the fog bank
  return {fog,background:t.sky};}
 function arenaKindFor(e){e=e||{};const r=String(typeof e==='string'?e:e.region||e.location||e.terrain||'').toLowerCase();if(/cave|cavern/.test(r))return 'cave';if(/ruin|spire/.test(r))return 'ruins';if(/rock|pass|summit|ridge/.test(r))return 'pass';if(/sea|shore|water|fish|beach/.test(r)||e.fishing)return 'shore';const y=Number(e.y);if(y>=25&&y<=38)return 'cave';if(y>=12&&y<=23)return 'ruins';if(y>=40&&y<=51||y>=1&&y<=10)return 'pass';if(y>=66&&y<=77)return 'shore';return 'meadow';}
 function buildWeather(T,kind,quality,scene,track){const sc=normalizeScene(scene),st=WEATHER_STYLE[sc.weather];if(!st)return null;
  const n=Math.max(1,Math.min(WEATHER_MAX[quality]||WEATHER_MAX.STANDARD,Math.round((WEATHER_MAX[quality]||WEATHER_MAX.STANDARD)*st.share))),B=WEATHER_BOX,rnd=mulberry((sc.layout^0x5EA7E)>>>0);
  const pos=new Float32Array(n*3);for(let i=0;i<n;i++){pos[i*3]=B.x0+rnd()*(B.x1-B.x0);pos[i*3+1]=B.y0+rnd()*(B.y1-B.y0);pos[i*3+2]=B.z0+rnd()*(B.z1-B.z0);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));
  if(st.colors){const col=new Float32Array(n*3),c=new T.Color();for(let i=0;i<n;i++){c.setHex(st.colors[i%st.colors.length]);col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}g.setAttribute('color',new T.BufferAttribute(col,3));}
  const m=new T.PointsMaterial({color:st.color,size:st.size,transparent:true,opacity:st.opacity,depthWrite:false,vertexColors:!!st.colors});
  track(g,m);const pts=new T.Points(g,m);pts.name='weather';pts.frustumCulled=false;pts.userData.kind=sc.weather;pts.userData.baseOpacity=st.opacity;return pts;}
 function buildArena(T,kind,quality,scene){if(!['meadow','shore','pass','ruins','cave'].includes(kind))kind='meadow';quality=quality||'STANDARD';const sc=normalizeScene(scene),root=new T.Group(),gs=new Set(),ms=new Set();root.name='arena-'+kind;
  const colors={meadow:[0x385944,0x77a365],shore:[0xb9a77c,0x5a9ea9],pass:[0x665e62,0x948b85],ruins:[0x596569,0xa3aaa0],cave:[0x282c43,0x63728b]}[kind];
  function mat(c,more){const m=new T.MeshStandardMaterial(Object.assign({color:c,roughness:.95},more));ms.add(m);return m;}const ground=mat(colors[0]),detail=mat(colors[1]),stone=mat(kind==='cave'?0x3b435c:0x777b7a),leaf=mat(0x437a58),bark=mat(0x514337),crystal=mat(0x6fe5dc,{emissive:0x3e948f,emissiveIntensity:.45});
  function add(shape,p,s,m){const g=shape==='box'?new T.BoxGeometry(2,2,2):shape==='cone'?new T.ConeGeometry(1,2,6):shape==='cylinder'?new T.CylinderGeometry(1,1,2,10):shape==='circle'?new T.CircleGeometry(1,24):new T.IcosahedronGeometry(1,0);gs.add(g);const o=new T.Mesh(g,m);o.position.set(...p);o.scale.set(...s);o.castShadow=quality!=='LOW';o.receiveShadow=true;root.add(o);return o;}
  add('cylinder',[0,-.22,0],[10,.2,7],ground);
  const shadowMaterial=new T.MeshBasicMaterial({color:0x0c1520,transparent:true,opacity:.25,depthWrite:false});ms.add(shadowMaterial);
  const shadows={};for(const [name,x] of [['mine',-3.5],['foe',3.5]]){const s=add('circle',[x,.012,0],[1.15,.75,1],shadowMaterial);s.rotation.x=-Math.PI/2;s.name='contact-'+name;s.castShadow=false;s.userData.base=[1.15,.75];shadows[name]=s;}
  for(let i=0;i<30;i++){const angle=i*2.39996,r=5.2+(i%5)*.72,x=Math.cos(angle)*r,z=Math.sin(angle)*r;add('rock',[x,.07,z],[.1+(i%3)*.12,.08,.15],i%2?detail:stone).userData.decor=true;}
  // Layout jitter: a prop's meshes move and scale together about its anchor (x0,0,z0). Layout 0 touches nothing.
  const rnd=sc.layout?mulberry(sc.layout):null;
  function inClear(x,z){return x>=CLEAR_BOX.x0&&x<=CLEAR_BOX.x1&&z>=CLEAR_BOX.z0&&z<=CLEAR_BOX.z1;}
  function jitter(meshes,x0,z0,tag){meshes[0].userData.prop=tag;if(!rnd)return;let x=Math.max(-CLAMP_X,Math.min(CLAMP_X,x0+(rnd()-.5)*JITTER_X)),z=z0-rnd()*JITTER_Z;const k=JITTER_SCALE_MIN+rnd()*JITTER_SCALE_SPAN;
   if(inClear(x,z))z=z0>CLEAR_BOX.z1?CLEAR_BOX.z1+CLEAR_PAD:CLEAR_BOX.z0-CLEAR_PAD;   // push back out on the side it came from
   for(const o of meshes){o.position.set(x+(o.position.x-x0)*k,o.position.y*k,z+(o.position.z-z0)*k);o.scale.multiplyScalar(k);}}
  for(let i=0;i<8;i++){const x=-8+i*2.2,z=-4.2-(i%3)*.7;let set;
   if(kind==='meadow'){set=[add('cylinder',[x,1.1,z],[.18,1.1,.18],bark),add('cone',[x,2.8,z],[1.05,1.7,1.05],leaf),add('cone',[x,3.8,z],[.7,1.1,.7],detail)];}
   else if(kind==='shore'){set=[add('rock',[x,.4,z],[1.05,.5,.8],stone)];const water=add('circle',[x,.025,2.8+(i%2)],[1.7,.85,1],detail);water.rotation.x=-Math.PI/2;jitter(set,x,z,'row');jitter([water],x,2.8+(i%2),'water');continue;}
   else if(kind==='ruins'){set=[add('cylinder',[x,.9,z],[.43,.9+(i%3)*.25,.43],stone),add('box',[x,1.85+(i%3)*.5,z],[.6,.16,.6],detail)];if(i%2===0)set.push(add('box',[x+.7,2.2,z],[.9,.18,.3],detail));}
   else if(kind==='pass'){set=[add('rock',[x,1.1,z],[1.45,1.7+(i%3)*.4,1.1],stone),add('rock',[x+.4,.4,z+.7],[.65,.5,.6],detail)];}
   else {set=[add('rock',[x,1.8,z],[1.55,2.2,1.2],stone),add('cone',[x+.3,.48,z+.7],[.28,.65,.28],crystal),add('cone',[x-.2,.23,z+.9],[.18,.4,.18],crystal)];}
   jitter(set,x,z,'row');
  }
  // Time of day: day is today's lighting exactly; the cave keeps its own colours and is only dimmed a little.
  const t=TIME_LIGHT[sc.time],day=TIME_LIGHT.day,cave=kind==='cave',caveScale=r=>1-(1-r)*CAVE_TIME_WEIGHT,sun=sc.weather==='sun'?SUN_KEY:1;
  const hemiI=cave?(sc.time==='day'?.85:.85*caveScale(t.hemi/day.hemi)):t.hemi,keyI=(cave?(sc.time==='day'?1.2:1.2*caveScale(t.key/day.key)):t.key)*sun;
  const hemi=new T.HemisphereLight(cave?0x8cbbe7:t.hemiSky,kind==='shore'?0x997d56:0x2b3037,hemiI);root.add(hemi);
  const key=new T.DirectionalLight(cave?0xa2c7f5:t.keyColor,keyI);key.position.set(-4,9,5);key.castShadow=quality!=='LOW';key.shadow.mapSize.set(quality==='HIGH'?2048:1024,quality==='HIGH'?2048:1024);Object.assign(key.shadow.camera,{left:-9,right:9,top:7,bottom:-7,near:.5,far:30});key.shadow.bias=-.001;root.add(key);root.add(key.target);
  const weather=buildWeather(T,kind,quality,sc,(g,m)=>{gs.add(g);ms.add(m);});if(weather)root.add(weather);
  let disposed=false;function dispose(){if(disposed)return;disposed=true;for(const g of gs)g.dispose();for(const m of ms)m.dispose();if(key.shadow.map)key.shadow.map.dispose();root.clear();}
  return {root,lights:[hemi,key],shadows,dispose,kind,quality,scene:sc,time:sc.time,weather};
 }
 return {arenaKindFor,buildArena,buildWeather,normalizeScene,sceneLook,DEFAULT_SCENE,TIME_LIGHT,WEATHER_MAX,WEATHER_BOX,WEATHER_STYLE,CLEAR_BOX,FOG_DEFAULT,FOG_WEATHER};
});
