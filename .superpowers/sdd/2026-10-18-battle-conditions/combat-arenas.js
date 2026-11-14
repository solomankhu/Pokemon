(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MonsterArenas=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function arenaKindFor(e){e=e||{};const r=String(typeof e==='string'?e:e.region||e.location||e.terrain||'').toLowerCase();if(/cave|cavern/.test(r))return 'cave';if(/ruin|spire/.test(r))return 'ruins';if(/rock|pass|summit|ridge/.test(r))return 'pass';if(/sea|shore|water|fish|beach/.test(r)||e.fishing)return 'shore';const y=Number(e.y);if(y>=25&&y<=38)return 'cave';if(y>=12&&y<=23)return 'ruins';if(y>=40&&y<=51||y>=1&&y<=10)return 'pass';if(y>=66&&y<=77)return 'shore';return 'meadow';}
 function buildArena(T,kind,quality){if(!['meadow','shore','pass','ruins','cave'].includes(kind))kind='meadow';quality=quality||'STANDARD';const root=new T.Group(),gs=new Set(),ms=new Set();root.name='arena-'+kind;
  const colors={meadow:[0x385944,0x77a365],shore:[0xb9a77c,0x5a9ea9],pass:[0x665e62,0x948b85],ruins:[0x596569,0xa3aaa0],cave:[0x282c43,0x63728b]}[kind];
  function mat(c,more){const m=new T.MeshStandardMaterial(Object.assign({color:c,roughness:.95},more));ms.add(m);return m;}const ground=mat(colors[0]),detail=mat(colors[1]),stone=mat(kind==='cave'?0x3b435c:0x777b7a),leaf=mat(0x437a58),bark=mat(0x514337),crystal=mat(0x6fe5dc,{emissive:0x3e948f,emissiveIntensity:.45});
  function add(shape,p,s,m){const g=shape==='box'?new T.BoxGeometry(2,2,2):shape==='cone'?new T.ConeGeometry(1,2,6):shape==='cylinder'?new T.CylinderGeometry(1,1,2,10):shape==='circle'?new T.CircleGeometry(1,24):new T.IcosahedronGeometry(1,0);gs.add(g);const o=new T.Mesh(g,m);o.position.set(...p);o.scale.set(...s);o.castShadow=quality!=='LOW';o.receiveShadow=true;root.add(o);return o;}
  add('cylinder',[0,-.22,0],[10,.2,7],ground);
  const shadowMaterial=new T.MeshBasicMaterial({color:0x0c1520,transparent:true,opacity:.25,depthWrite:false});ms.add(shadowMaterial);
  const shadows={};for(const [name,x] of [['mine',-3.5],['foe',3.5]]){const s=add('circle',[x,.012,0],[1.15,.75,1],shadowMaterial);s.rotation.x=-Math.PI/2;s.name='contact-'+name;s.castShadow=false;s.userData.base=[1.15,.75];shadows[name]=s;}
  for(let i=0;i<30;i++){const angle=i*2.39996,r=5.2+(i%5)*.72,x=Math.cos(angle)*r,z=Math.sin(angle)*r;add('rock',[x,.07,z],[.1+(i%3)*.12,.08,.15],i%2?detail:stone);}
  for(let i=0;i<8;i++){const x=-8+i*2.2,z=-4.2-(i%3)*.7;
   if(kind==='meadow'){add('cylinder',[x,1.1,z],[.18,1.1,.18],bark);add('cone',[x,2.8,z],[1.05,1.7,1.05],leaf);add('cone',[x,3.8,z],[.7,1.1,.7],detail);}
   else if(kind==='shore'){add('rock',[x,.4,z],[1.05,.5,.8],stone);const water=add('circle',[x,.025,2.8+(i%2)],[1.7,.85,1],detail);water.rotation.x=-Math.PI/2;}
   else if(kind==='ruins'){add('cylinder',[x,.9,z],[.43,.9+(i%3)*.25,.43],stone);add('box',[x,1.85+(i%3)*.5,z],[.6,.16,.6],detail);if(i%2===0)add('box',[x+.7,2.2,z],[.9,.18,.3],detail);}
   else if(kind==='pass'){add('rock',[x,1.1,z],[1.45,1.7+(i%3)*.4,1.1],stone);add('rock',[x+.4,.4,z+.7],[.65,.5,.6],detail);}
   else {add('rock',[x,1.8,z],[1.55,2.2,1.2],stone);add('cone',[x+.3,.48,z+.7],[.28,.65,.28],crystal);add('cone',[x-.2,.23,z+.9],[.18,.4,.18],crystal);}
  }
  const hemi=new T.HemisphereLight(kind==='cave'?0x8cbbe7:0xc4e9ff,kind==='shore'?0x997d56:0x2b3037,kind==='cave'?.85:1.1);root.add(hemi);
  const key=new T.DirectionalLight(kind==='cave'?0xa2c7f5:0xffe9c6,1.2);key.position.set(-4,9,5);key.castShadow=quality!=='LOW';key.shadow.mapSize.set(quality==='HIGH'?2048:1024,quality==='HIGH'?2048:1024);Object.assign(key.shadow.camera,{left:-9,right:9,top:7,bottom:-7,near:.5,far:30});key.shadow.bias=-.001;root.add(key);root.add(key.target);
  let disposed=false;function dispose(){if(disposed)return;disposed=true;for(const g of gs)g.dispose();for(const m of ms)m.dispose();if(key.shadow.map)key.shadow.map.dispose();root.clear();}
  return {root,lights:[hemi,key],shadows,dispose,kind,quality};
 }
 return {arenaKindFor,buildArena};
});
