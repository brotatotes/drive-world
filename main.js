import * as THREE from 'three';
import { RING, ROAD_W, WATER_Y, G, HILL, PARK, LIGHTHOUSE, terrainH, ground, roadDist, wob, ramps, pads, coinSpots, onPad, rng, clamp } from './world.js';

const $ = s => document.querySelector(s);
const rand = rng(104729);
const touchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touchDevice) document.body.classList.add('touch');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touchDevice ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcde0ef, 170, 410);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 650);

// Sky dome.
const sky = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { top: { value: new THREE.Color(0x438ad3) }, bottom: { value: new THREE.Color(0xe8f3fb) } },
  vertexShader: 'varying vec3 p; void main(){ p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 p; void main(){ float t=clamp(normalize(p).y*.65+.38,0.,1.); gl_FragColor=vec4(mix(bottom,top,t),1.); }'
}));
scene.add(sky);
scene.add(new THREE.HemisphereLight(0xbcdcff, 0x53613a, 1.5));
const sun = new THREE.DirectionalLight(0xffe6b7, 2.6);
sun.position.set(50, 85, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(touchDevice ? 1024 : 2048, touchDevice ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 230 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

function canvasTexture(draw, w=256, h=256) {
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Terrain.
const T_SIZE = 500, T_SEG = touchDevice ? 130 : 180;
const tg = new THREE.PlaneGeometry(T_SIZE, T_SIZE, T_SEG, T_SEG);
tg.rotateX(-Math.PI / 2);
const p = tg.attributes.position, colors=[];
for (let i=0;i<p.count;i++) {
  const x=p.getX(i), z=p.getZ(i), h=terrainH(x,z); p.setY(i,h);
  const coast = wob(x,z);
  let c;
  if (h < WATER_Y + .35 || coast > 204) c = new THREE.Color(0xc8ae6b);
  else if (h > 10) c = new THREE.Color(0x6e8040);
  else c = new THREE.Color().setHSL(0.29 + rand()*.025, .47, .38 + rand()*.045);
  colors.push(c.r,c.g,c.b);
}
tg.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
tg.computeVertexNormals();
const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.98, flatShading:true }));
terrain.receiveShadow = true;
scene.add(terrain);

const water = new THREE.Mesh(new THREE.PlaneGeometry(820,820,20,20), new THREE.MeshStandardMaterial({ color:0x378fbd, roughness:.24, metalness:.08, transparent:true, opacity:.82 }));
water.rotation.x=-Math.PI/2; water.position.y=WATER_Y; water.receiveShadow=true; scene.add(water);

// Roads.
const roadMat = new THREE.MeshStandardMaterial({ color:0x3b4249, roughness:.94, polygonOffset:true, polygonOffsetFactor:-2 });
function flatMesh(geom, y=.06, mat=roadMat) { const m=new THREE.Mesh(geom,mat); m.rotation.x=-Math.PI/2; m.position.y=y; m.receiveShadow=true; scene.add(m); return m; }
flatMesh(new THREE.RingGeometry(RING-ROAD_W/2,RING+ROAD_W/2,192),.07);
flatMesh(new THREE.PlaneGeometry(RING*2,ROAD_W),.075);
flatMesh(new THREE.PlaneGeometry(ROAD_W,RING+176),.08).position.z=(RING-176)/2;
const plazaMat=new THREE.MeshStandardMaterial({color:0xb9aa91,roughness:1});
flatMesh(new THREE.CircleGeometry(28,48),.085,plazaMat);
const dirtMat=new THREE.MeshStandardMaterial({color:0xa78558,roughness:1});
const parkDisk=flatMesh(new THREE.CircleGeometry(28,48),.082,dirtMat); parkDisk.position.set(PARK.x,.082,PARK.z);

// Ring dashes.
const dashGeo=new THREE.BoxGeometry(.18,.035,3.8), dashMat=new THREE.MeshStandardMaterial({color:0xf3e4a7});
const dashes=new THREE.InstancedMesh(dashGeo,dashMat,64); const dm=new THREE.Matrix4();
for(let i=0;i<64;i++){const a=i/64*Math.PI*2; dm.compose(new THREE.Vector3(Math.cos(a)*RING,.11,Math.sin(a)*RING),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-a),new THREE.Vector3(1,1,1));dashes.setMatrixAt(i,dm);} scene.add(dashes);

// Ramp meshes.
const rampMat=new THREE.MeshStandardMaterial({color:0xf39a32,roughness:.72,metalness:.08});
function rampMesh(r) {
  const sh=new THREE.Shape();
  if(r.type==='wedge'){sh.moveTo(-r.L/2,0);sh.lineTo(r.L/2,r.H);sh.lineTo(r.L/2,0);}
  else {const a=r.up+r.top/2;sh.moveTo(-a,0);sh.lineTo(-r.top/2,r.H);sh.lineTo(r.top/2,r.H);sh.lineTo(a,0);}
  sh.closePath();
  const g=new THREE.ExtrudeGeometry(sh,{depth:r.W,bevelEnabled:false});
  g.translate(0,0,-r.W/2); g.rotateY(-Math.PI/2); g.computeVertexNormals();
  const m=new THREE.Mesh(g,rampMat); m.position.set(r.x,terrainH(r.x,r.z)+.04,r.z);m.rotation.y=r.h;m.castShadow=true;m.receiveShadow=true;scene.add(m);
}
ramps.forEach(rampMesh);

const padTex=canvasTexture((c,w,h)=>{c.fillStyle='#18384a';c.fillRect(0,0,w,h);c.strokeStyle='#62edff';c.lineWidth=18;for(let y=-30;y<h+60;y+=70){c.beginPath();c.moveTo(32,y);c.lineTo(w/2,y+38);c.lineTo(w-32,y);c.stroke();}});
padTex.wrapS=padTex.wrapT=THREE.RepeatWrapping;
const padMat=new THREE.MeshStandardMaterial({map:padTex,emissive:0x1ac7e4,emissiveMap:padTex,emissiveIntensity:1.4,side:THREE.DoubleSide});
for(const b of pads){const m=new THREE.Mesh(new THREE.PlaneGeometry(b.W,b.L),padMat);m.rotation.set(-Math.PI/2,b.h,0);m.position.set(b.x,ground(b.x,b.z)+.12,b.z);scene.add(m);}

const circles=[], boxes=[];
function addCircle(x,z,r,top=20){circles.push({x,z,r,top});}
function addBox(x,z,w,d,top){boxes.push({x,z,w,d,top});}

// Fountain.
const stone=new THREE.MeshStandardMaterial({color:0xc5b9a5,roughness:.88});
const basin=new THREE.Mesh(new THREE.CylinderGeometry(7,7.8,1.2,32),stone);basin.position.y=.65;basin.castShadow=true;basin.receiveShadow=true;scene.add(basin);
const pool=new THREE.Mesh(new THREE.CylinderGeometry(6.2,6.2,.25,32),new THREE.MeshStandardMaterial({color:0x4fbed7,roughness:.15,metalness:.15}));pool.position.y=1.3;scene.add(pool);
const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.3,5,16),stone);pillar.position.y=3.3;pillar.castShadow=true;scene.add(pillar);
const bowl=new THREE.Mesh(new THREE.CylinderGeometry(2.3,1.2,.7,24),stone);bowl.position.y=5.7;scene.add(bowl);addCircle(0,0,8,7);

// Houses.
const wallColors=[0xe9a68f,0xe7cf8a,0xa9cbe2,0xb8d3a6,0xd3b1dc,0xf0d8bd];
function house(x,z,w,d,h,face) {
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:wallColors[Math.floor(rand()*wallColors.length)],roughness:.92}));body.position.y=h/2;body.castShadow=true;body.receiveShadow=true;g.add(body);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*.72,3.4,4),new THREE.MeshStandardMaterial({color:[0x8e4639,0x65505b,0x4f5965][Math.floor(rand()*3)],roughness:.9}));roof.position.y=h+1.7;roof.rotation.y=Math.PI/4;roof.castShadow=true;g.add(roof);
  const door=new THREE.Mesh(new THREE.BoxGeometry(1.3,2.5,.15),new THREE.MeshStandardMaterial({color:0x5b3827}));door.position.set(0,1.25,d/2+.08);g.add(door);
  g.position.set(x,terrainH(x,z),z);g.rotation.y=face;scene.add(g);addBox(x,z,w,d,h+3.4);
}
for(const axis of ['x','z']) for(const sign of [-1,1]) for(const dist of [40,76]) for(const side of [-1,1]) {
  let x=axis==='x'?sign*dist:side*14, z=axis==='z'?sign*dist:side*14;
  if(Math.hypot(x-PARK.x,z-PARK.z)<42||Math.hypot(x-HILL.x,z-HILL.z)<34)continue;
  house(x,z,8+rand()*4,7+rand()*3,6+rand()*7,axis==='x'?(side>0?Math.PI:0):(side>0?-Math.PI/2:Math.PI/2));
}

// Windmill.
const wind=new THREE.Group();wind.position.set(HILL.x,terrainH(HILL.x,HILL.z),HILL.z);scene.add(wind);
const tower=new THREE.Mesh(new THREE.CylinderGeometry(2.1,3.8,13,12),new THREE.MeshStandardMaterial({color:0xf1e0bd,roughness:.9}));tower.position.y=6.5;tower.castShadow=true;wind.add(tower);
const cap=new THREE.Mesh(new THREE.ConeGeometry(3.3,3.5,12),new THREE.MeshStandardMaterial({color:0x9b4936}));cap.position.y=14.5;cap.castShadow=true;wind.add(cap);
const bladeHub=new THREE.Group();bladeHub.position.set(0,11.4,2.4);wind.add(bladeHub);
const hub=new THREE.Mesh(new THREE.SphereGeometry(.7,12,8),new THREE.MeshStandardMaterial({color:0x6d4d32}));bladeHub.add(hub);
for(let i=0;i<4;i++){const arm=new THREE.Mesh(new THREE.BoxGeometry(.55,8,.22),new THREE.MeshStandardMaterial({color:0xefe5cf}));arm.position.y=4;arm.rotation.z=i*Math.PI/2;arm.castShadow=true;bladeHub.add(arm);}addCircle(HILL.x,HILL.z,4,16);

// Lighthouse.
const light=new THREE.Group();light.position.set(LIGHTHOUSE.x,terrainH(LIGHTHOUSE.x,LIGHTHOUSE.z),LIGHTHOUSE.z);scene.add(light);
for(let i=0;i<5;i++){const seg=new THREE.Mesh(new THREE.CylinderGeometry(2.2-i*.14,2.6-i*.14,3,20),new THREE.MeshStandardMaterial({color:i%2?0xf4eee0:0xd94b3f,roughness:.8}));seg.position.y=1.5+i*3;seg.castShadow=true;light.add(seg);}
const gallery=new THREE.Mesh(new THREE.CylinderGeometry(3.1,3.1,.45,24),new THREE.MeshStandardMaterial({color:0x26323b}));gallery.position.y=15.4;light.add(gallery);
const lamp=new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.7,2.5,16),new THREE.MeshStandardMaterial({color:0xffdf74,emissive:0xffb936,emissiveIntensity:2,transparent:true,opacity:.8}));lamp.position.y=16.8;light.add(lamp);
const roof=new THREE.Mesh(new THREE.ConeGeometry(2.4,2.3,16),new THREE.MeshStandardMaterial({color:0xb84036}));roof.position.y=19;light.add(roof);
const beam=new THREE.Mesh(new THREE.ConeGeometry(5,45,16,1,true),new THREE.MeshBasicMaterial({color:0xffefad,transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));beam.rotation.z=-Math.PI/2;beam.position.set(22.5,16.8,0);light.add(beam);addCircle(LIGHTHOUSE.x,LIGHTHOUSE.z,3.5,20);

// Coins.
const coinGeo=new THREE.TorusGeometry(.72,.22,10,22), coinMat=new THREE.MeshStandardMaterial({color:0xffd231,emissive:0xb76a00,emissiveIntensity:.55,metalness:.75,roughness:.2});
const coins=coinSpots.map(([x,z,dy],i)=>{const m=new THREE.Mesh(coinGeo,coinMat);m.position.set(x,ground(x,z)+dy,z);m.castShadow=true;scene.add(m);return{m,x,z,base:m.position.y,got:false,i};});

// Trees and rocks.
const trees=[];
for(let tries=0;tries<2400&&trees.length<(touchDevice?270:390);tries++){
  const a=rand()*Math.PI*2,r=38+Math.sqrt(rand())*165,x=Math.cos(a)*r,z=Math.sin(a)*r;
  if(terrainH(x,z)<-.05||roadDist(x,z)<9||Math.hypot(x-PARK.x,z-PARK.z)<37||Math.hypot(x-HILL.x,z-HILL.z)<22||Math.hypot(x-LIGHTHOUSE.x,z-LIGHTHOUSE.z)<24)continue;
  if(boxes.some(b=>Math.abs(x-b.x)<b.w/2+6&&Math.abs(z-b.z)<b.d/2+6)||coinSpots.some(c=>Math.hypot(x-c[0],z-c[1])<5))continue;
  const s=.7+rand()*.8; trees.push({x,z,s,round:rand()<.38}); addCircle(x,z,.65*s,terrainH(x,z)+8*s);
}
const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.34,.5,3,7),new THREE.MeshStandardMaterial({color:0x6b4b30}),trees.length);
const pines=new THREE.InstancedMesh(new THREE.ConeGeometry(2.1,6,8),new THREE.MeshStandardMaterial({color:0x2e6e3d,flatShading:true}),trees.length);
const rounds=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.5,1),new THREE.MeshStandardMaterial({color:0x477d42,flatShading:true}),trees.length);
const nullScale=new THREE.Vector3(0,0,0);
trees.forEach((t,i)=>{const y=terrainH(t.x,t.z),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rand()*6.28);dm.compose(new THREE.Vector3(t.x,y+1.5*t.s,t.z),q,new THREE.Vector3(t.s,t.s,t.s));trunks.setMatrixAt(i,dm);const pos=new THREE.Vector3(t.x,y+5*t.s,t.z);dm.compose(pos,q,t.round?nullScale:new THREE.Vector3(t.s,t.s,t.s));pines.setMatrixAt(i,dm);dm.compose(pos,q,t.round?new THREE.Vector3(t.s,t.s,t.s):nullScale);rounds.setMatrixAt(i,dm);});
for(const m of[trunks,pines,rounds]){m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);}

// Clouds.
const clouds=[];
for(let i=0;i<15;i++){const g=new THREE.Group();for(let j=0;j<4;j++){const puff=new THREE.Mesh(new THREE.IcosahedronGeometry(5+rand()*4,1),new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.82}));puff.position.set(j*6+rand()*2,rand()*3,rand()*5);puff.scale.y=.65;g.add(puff);}g.position.set(-280+rand()*560,70+rand()*35,-220+rand()*440);scene.add(g);clouds.push(g);}

// Beach balls.
const balls=[];
const ballColors=[0xff6256,0x4db6ff,0xffcc40,0xb867e8,0x53d28c];
for(const [x,z] of [[12,-5],[-10,8],[PARK.x,PARK.z],[PARK.x+9,PARK.z-6],[-34,28],[22,70]]){const r=1.45,m=new THREE.Mesh(new THREE.SphereGeometry(r,20,12),new THREE.MeshStandardMaterial({color:ballColors[balls.length%ballColors.length],roughness:.45,metalness:.05}));m.position.set(x,ground(x,z)+r,z);m.castShadow=true;scene.add(m);balls.push({m,x,z,y:m.position.y,vx:0,vz:0,vy:0,r,home:{x,z}});}

// Car model.
const carRoot=new THREE.Group(), carTilt=new THREE.Group();carRoot.add(carTilt);scene.add(carRoot);
const red=new THREE.MeshStandardMaterial({color:0xd83b35,metalness:.5,roughness:.28}), dark=new THREE.MeshStandardMaterial({color:0x182431,metalness:.15,roughness:.22});
function carBox(w,h,d,mat,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;carTilt.add(m);return m;}
carBox(3.7,.85,6.2,red,0,1.15,0);carBox(3.35,.8,2.8,dark,0,1.9,-.25);carBox(3.55,.28,2.4,red,0,2.35,-.28);carBox(3.85,.16,1.0,red,0,2.25,-2.72);
const wheelPivots=[],wheels=[];const wheelGeo=new THREE.CylinderGeometry(.65,.65,.48,16);wheelGeo.rotateZ(Math.PI/2);const tire=new THREE.MeshStandardMaterial({color:0x161616,roughness:.92});
for(const x of[-2,2])for(const z of[-1.85,1.85]){const pivot=new THREE.Group();pivot.position.set(x,.72,z);carTilt.add(pivot);const m=new THREE.Mesh(wheelGeo,tire);m.castShadow=true;pivot.add(m);wheels.push(m);if(z>0)wheelPivots.push(pivot);}
const glow=new THREE.MeshStandardMaterial({color:0xfff2b3,emissive:0xffd45a,emissiveIntensity:2});for(const x of[-1.15,1.15])carBox(.52,.25,.12,glow,x,1.25,3.15);

// Particles.
const particles=[];
const pg=new THREE.IcosahedronGeometry(.25,0);
for(let i=0;i<72;i++){const mat=new THREE.MeshBasicMaterial({transparent:true});const m=new THREE.Mesh(pg,mat);m.visible=false;scene.add(m);particles.push({m,t:0,v:new THREE.Vector3(),g:0});}
let pIndex=0;
function puff(pos,color=0xffffff,n=8,speed=6){for(let i=0;i<n;i++){const o=particles[pIndex++%particles.length];o.m.visible=true;o.m.position.copy(pos);o.m.material.color.set(color);o.m.material.opacity=1;o.m.scale.setScalar(.6+rand());o.t=.6+rand()*.5;o.g=5;o.v.set((rand()-.5)*speed,rand()*speed,(rand()-.5)*speed);}}

const keys={left:false,right:false,gas:false,brake:false,drift:false};
let started=false,finished=false,startAt=0,finishTime=0,collected=0,msgTimer=0,shake=0,camMode=0,accum=0;
const car={x:0,z:-20,y:ground(0,-20),heading:Math.PI,vx:0,vz:0,vy:0,grounded:true,steer:0,air:0,boost:0,padLock:0,safe:{x:0,z:-20,h:Math.PI},safeTimer:0,pitch:0,roll:0};
function start(){if(started)return;started=true;startAt=performance.now();$('#start').classList.add('hidden');}
function showMsg(text,sec=1.3){$('#msg').textContent=text;$('#msg').classList.add('show');msgTimer=sec;}
function resetCar(){Object.assign(car,{x:car.safe.x,z:car.safe.z,y:ground(car.safe.x,car.safe.z)+.1,heading:car.safe.h,vx:0,vz:0,vy:0,grounded:true,air:0,boost:0});showMsg('Back on the road',.8);}
function mapKey(e,on){const k=e.key.toLowerCase();let hit=true;if(k==='arrowleft'||k==='a')keys.left=on;else if(k==='arrowright'||k==='d')keys.right=on;else if(k==='arrowup'||k==='w')keys.gas=on;else if(k==='arrowdown'||k==='s')keys.brake=on;else if(k===' ')keys.drift=on;else hit=false;if(hit){e.preventDefault();if(on)start();}if(on&&k==='r')resetCar();if(on&&k==='c')camMode=(camMode+1)%2;}
addEventListener('keydown',e=>mapKey(e,true));addEventListener('keyup',e=>mapKey(e,false));addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
$('#start').addEventListener('pointerdown',start);
document.querySelectorAll('#touch button').forEach(b=>{const k=b.dataset.k;const set=on=>{keys[k]=on;b.classList.toggle('on',on);if(on)start();};b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);set(true)});for(const ev of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>set(false));});

function resolveObstacles(){
  const rad=1.65;
  for(const o of circles){if(car.y>o.top+1)continue;const dx=car.x-o.x,dz=car.z-o.z,d=Math.hypot(dx,dz),lim=rad+o.r;if(d<lim&&d>.001){const nx=dx/d,nz=dz/d,pen=lim-d;car.x+=nx*pen;car.z+=nz*pen;const vn=car.vx*nx+car.vz*nz;if(vn<0){car.vx-=1.5*vn*nx;car.vz-=1.5*vn*nz;shake=Math.max(shake,Math.min(-vn*.025,.22));}}}
  for(const b of boxes){if(car.y>b.top+1)continue;const qx=clamp(car.x,b.x-b.w/2,b.x+b.w/2),qz=clamp(car.z,b.z-b.d/2,b.z+b.d/2);let dx=car.x-qx,dz=car.z-qz,d=Math.hypot(dx,dz);if(d<rad){if(d<.001){const px=b.w/2-Math.abs(car.x-b.x),pz=b.d/2-Math.abs(car.z-b.z);if(px<pz){dx=Math.sign(car.x-b.x)||1;dz=0}else{dx=0;dz=Math.sign(car.z-b.z)||1}d=1;}const nx=dx/d,nz=dz/d,pen=rad-d;car.x+=nx*pen;car.z+=nz*pen;const vn=car.vx*nx+car.vz*nz;if(vn<0){car.vx-=1.5*vn*nx;car.vz-=1.5*vn*nz;shake=Math.max(shake,.12);}}}
}

function step(dt){
  if(!started)return;
  const fwdX=Math.sin(car.heading),fwdZ=Math.cos(car.heading),rightX=Math.cos(car.heading),rightZ=-Math.sin(car.heading);
  let vf=car.vx*fwdX+car.vz*fwdZ,vs=car.vx*rightX+car.vz*rightZ;
  const throttle=(keys.gas?1:0)-(keys.brake?1:0), steer=(keys.left?1:0)-(keys.right?1:0);
  car.steer+=(steer-car.steer)*(1-Math.exp(-8*dt));
  if(car.grounded){
    if(throttle>0)vf+=22*dt; else if(throttle<0)vf-= (vf>0?38:15)*dt;
    else vf*=Math.exp(-1.15*dt);
    vf=clamp(vf,-12,car.boost>0?58:38);
    vs*=Math.exp(-(keys.drift?1.7:8.5)*dt);
    const turn=car.steer*Math.min(Math.abs(vf)/7,1)*(keys.drift?2.1:1.45)*(vf<0?-1:1);
    car.heading+=turn*dt;
  } else car.heading+=car.steer*.35*dt;
  if(car.boost>0){car.boost-=dt;vf=Math.max(vf,48);}
  const nfX=Math.sin(car.heading),nfZ=Math.cos(car.heading),nrX=Math.cos(car.heading),nrZ=-Math.sin(car.heading);
  car.vx=nfX*vf+nrX*vs;car.vz=nfZ*vf+nrZ*vs;
  const ox=car.x,oz=car.z,oldGround=ground(ox,oz);car.x+=car.vx*dt;car.z+=car.vz*dt;
  const newGround=ground(car.x,car.z),travel=Math.hypot(car.x-ox,car.z-oz);
  if(car.grounded&&newGround-oldGround>Math.max(.32,travel*.9)){car.x=ox;car.z=oz;car.vx*=-.18;car.vz*=-.18;shake=Math.max(shake,.14);}
  resolveObstacles();
  const gNow=ground(car.x,car.z);
  if(car.grounded){
    const climb=(gNow-oldGround)/dt;
    if(car.y+Math.max(climb,0)*dt > gNow+.12 || oldGround-gNow>.22){car.grounded=false;car.vy=clamp(climb,-4,12);car.air=0;}
    else {car.y=gNow;car.vy=clamp(climb,-12,12);}
  }
  if(!car.grounded){car.vy-=G*dt;car.y+=car.vy*dt;car.air+=dt;if(car.y<=gNow){if(car.vy<-8){shake=Math.max(shake,Math.min(-car.vy*.018,.35));puff(new THREE.Vector3(car.x,gNow+.3,car.z),0xd6c39b,8,5);}if(car.air>.85)showMsg('Big air!');car.y=gNow;car.vy=0;car.grounded=true;car.air=0;}}
  const rr=Math.hypot(car.x,car.z);if(wob(car.x,car.z)>221||terrainH(car.x,car.z)<WATER_Y-.25){puff(new THREE.Vector3(car.x,WATER_Y+.2,car.z),0x8edcf2,14,8);resetCar();showMsg('Splash!',1);}
  const pad=onPad(car.x,car.z);car.padLock=Math.max(0,car.padLock-dt);if(pad&&car.padLock<=0){car.boost=1.5;car.padLock=1;showMsg('Boost!');}
  car.safeTimer-=dt;if(car.grounded&&rr<185&&car.safeTimer<=0){car.safe={x:car.x,z:car.z,h:car.heading};car.safeTimer=.9;}
  // Car-ball impulses and ball physics.
  for(const b of balls){const dx=b.x-car.x,dz=b.z-car.z,d=Math.hypot(dx,dz),lim=b.r+1.8;if(d<lim&&d>.01&&Math.abs((b.y-b.r)-car.y)<3){const nx=dx/d,nz=dz/d,push=(Math.max(8,Math.hypot(car.vx,car.vz)))*.72;b.vx+=nx*push;b.vz+=nz*push;b.vy+=3+push*.12;b.x=car.x+nx*lim;b.z=car.z+nz*lim;}}
  for(const b of balls){b.vy-=G*dt;b.x+=b.vx*dt;b.z+=b.vz*dt;b.y+=b.vy*dt;b.vx*=Math.exp(-.45*dt);b.vz*=Math.exp(-.45*dt);const gh=ground(b.x,b.z)+b.r;if(b.y<gh){b.y=gh;if(b.vy<-2)b.vy*=-.42;else b.vy=0;b.vx*=Math.exp(-1.7*dt);b.vz*=Math.exp(-1.7*dt);}if(wob(b.x,b.z)>222){b.x=b.home.x;b.z=b.home.z;b.y=ground(b.x,b.z)+b.r;b.vx=b.vz=b.vy=0;}b.m.position.set(b.x,b.y,b.z);b.m.rotation.x+=b.vz*dt/b.r;b.m.rotation.z-=b.vx*dt/b.r;}
}

function collectAndAnimate(t,dt){
  for(const c of coins){if(c.got)continue;c.m.rotation.y=t*2.4+c.i;c.m.rotation.x=Math.PI/2+Math.sin(t+c.i)*.15;c.m.position.y=c.base+Math.sin(t*2+c.i)*.28;const dy=c.m.position.y-(car.y+1.3);if(Math.hypot(c.x-car.x,c.z-car.z)<2.3&&Math.abs(dy)<2.8){c.got=true;c.m.visible=false;collected++;puff(c.m.position,0xffd53f,12,8);$('#coins').textContent=`★ ${collected} / ${coins.length}`;if(collected===coins.length){finished=true;finishTime=(performance.now()-startAt)/1000;showMsg(`All coins! ${formatTime(finishTime)}`,8);}}}
  for(const o of particles){if(o.t<=0)continue;o.t-=dt;o.v.y-=o.g*dt;o.m.position.addScaledVector(o.v,dt);o.m.material.opacity=Math.max(0,o.t);o.m.scale.multiplyScalar(Math.exp(-.45*dt));if(o.t<=0)o.m.visible=false;}
}

function updateVisuals(dt,t){
  const speed=Math.hypot(car.vx,car.vz),fX=Math.sin(car.heading),fZ=Math.cos(car.heading),rX=Math.cos(car.heading),rZ=-Math.sin(car.heading);
  carRoot.position.set(car.x,car.y,car.z);carRoot.rotation.y=car.heading;
  let tp,tr;if(car.grounded){tp=-Math.atan2(ground(car.x+fX*2.2,car.z+fZ*2.2)-ground(car.x-fX*2.2,car.z-fZ*2.2),4.4);tr=Math.atan2(ground(car.x+rX*1.5,car.z+rZ*1.5)-ground(car.x-rX*1.5,car.z-rZ*1.5),3);}else{tp=-Math.atan2(car.vy,Math.max(speed,8))*.7;tr=0;}
  car.pitch+=(tp-car.pitch)*(1-Math.exp(-8*dt));car.roll+=(tr-car.roll)*(1-Math.exp(-8*dt));carTilt.rotation.set(car.pitch,0,car.roll-car.steer*Math.min(speed/40,1)*.09,'ZXY');
  for(const w of wheels)w.rotation.x+=speed*dt/.65;for(const w of wheelPivots)w.rotation.y=car.steer*.42;
  if(car.grounded&&keys.drift&&speed>12&&Math.abs(car.steer)>.25&&Math.random()<dt*18)puff(new THREE.Vector3(car.x-fX*2,car.y+.25,car.z-fZ*2),0xc4c0b5,1,2.5);
  // Camera.
  const dist=camMode?18:11, height=camMode?9:5.5;const desired=new THREE.Vector3(car.x-fX*dist,car.y+height,car.z-fZ*dist);const minY=terrainH(desired.x,desired.z)+2.2;desired.y=Math.max(desired.y,minY);camera.position.lerp(desired,1-Math.exp(-6*dt));const s=shake;shake*=Math.exp(-8*dt);camera.position.add(new THREE.Vector3((rand()-.5)*s,(rand()-.5)*s,(rand()-.5)*s));camera.lookAt(car.x+fX*5,car.y+1.7,car.z+fZ*5);const targetFov=55+Math.min(speed/6,8)+(car.boost>0?5:0);camera.fov+=(targetFov-camera.fov)*(1-Math.exp(-5*dt));camera.updateProjectionMatrix();
  sun.position.set(car.x+55,car.y+85,car.z+35);sun.target.position.set(car.x,car.y,car.z);sky.position.copy(camera.position);
  bladeHub.rotation.z=t*.85;beam.rotation.x=t*.35;
  clouds.forEach((c,i)=>{c.position.x+=dt*(2+i%3);if(c.position.x>310)c.position.x=-310;});water.position.y=WATER_Y+Math.sin(t*.35)*.04;
}

const map=$('#map'),ctx=map.getContext('2d'),mapBase=document.createElement('canvas');mapBase.width=mapBase.height=500;const bx=mapBase.getContext('2d');
for(let y=0;y<500;y+=2)for(let x=0;x<500;x+=2){const wx=(x/500-.5)*500,wz=(y/500-.5)*500,h=terrainH(wx,wz);bx.fillStyle=h<WATER_Y?'#3f98bb':wob(wx,wz)>198?'#c7ad70':roadDist(wx,wz)<ROAD_W/2?'#454b50':h>9?'#687c3d':'#568447';bx.fillRect(x,y,2,2);}bx.fillStyle='#baa88e';bx.beginPath();bx.arc(250,250,28,0,7);bx.fill();bx.fillStyle='#a17d50';bx.beginPath();bx.arc(250+PARK.x,250+PARK.z,28,0,7);bx.fill();
function drawMap(){const W=map.width,H=map.height,scale=.7;ctx.clearRect(0,0,W,H);ctx.save();ctx.beginPath();ctx.arc(W/2,H/2,W/2-3,0,7);ctx.clip();ctx.fillStyle='#254a60';ctx.fillRect(0,0,W,H);ctx.translate(W/2,H/2);ctx.rotate(car.heading);ctx.scale(scale,scale);ctx.translate(-car.x,-car.z);ctx.drawImage(mapBase,-250,-250);for(const c of coins)if(!c.got){ctx.fillStyle='#ffd83f';ctx.beginPath();ctx.arc(c.x,c.z,3.8/scale,0,7);ctx.fill();}ctx.restore();ctx.save();ctx.translate(W/2,H/2);ctx.fillStyle='#e8473c';ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(8,8);ctx.lineTo(0,5);ctx.lineTo(-8,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
function formatTime(s){const m=Math.floor(s/60),sec=s-m*60;return `${m}:${sec.toFixed(1).padStart(4,'0')}`;}
function updateHud(){const speed=Math.hypot(car.vx,car.vz);$('#mph').textContent=Math.round(speed*2.237);const s=finished?finishTime:started?(performance.now()-startAt)/1000:0;$('#time').textContent=formatTime(s);if(msgTimer>0){msgTimer-=1/60;if(msgTimer<=0)$('#msg').classList.remove('show');}drawMap();}

let last=performance.now();
function animate(now){const dt=Math.min((now-last)/1000,.05);last=now;accum+=dt;while(accum>=1/120){step(1/120);accum-=1/120;}collectAndAnimate(now/1000,dt);updateVisuals(dt,now/1000);updateHud();renderer.render(scene,camera);requestAnimationFrame(animate);}requestAnimationFrame(animate);

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1.5:2));renderer.setSize(innerWidth,innerHeight);});
$('#coins').textContent=`★ 0 / ${coins.length}`;
window.__game={ready:true,car,coins,ramps,keys,step,collectAndAnimate,reset:resetCar,start,teleport(x,z,h=car.heading){car.x=x;car.z=z;car.y=ground(x,z);car.heading=h;car.vx=car.vz=car.vy=0;car.grounded=true;},state(){return{started,collected,total:coins.length,x:car.x,z:car.z,y:car.y,speed:Math.hypot(car.vx,car.vz),grounded:car.grounded};}};
