// Marble Race v5 core — Matter.js engine, seeded determinism, simulate-and-select.
// Node-testable: require('/tmp/matter.min.js') as M. Browser: window.Matter.
let M; if(typeof window!=='undefined'&&window.Matter){M=window.Matter;} else { try{M=require('matter-js');}catch(e){M=require('/tmp/matter.min.js');} }
const {Engine,Composite,Bodies,Body}=M;

let W=432,H=768,R,wallL,wallR,finishY,worldH,accent;
let engine,world,marbles=[],spinners=[],dynObs=[],GRAV=1.0,prng=Math.random;
let optN=0,optLen=1,optMode='race';  // settings: marble count (0=random), course-length multiplier, game mode
const FIXED=1/60,VCAP=26;  // VCAP: max px/step — prevents tunneling through walls (Matter has no CCD)

function rngFrom(s){s>>>=0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function shuffle(a,rng){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function hueName(h){h=((h%360)+360)%360;const NM=[[16,'Red'],[45,'Orange'],[66,'Yellow'],[100,'Lime'],[150,'Green'],[185,'Teal'],[212,'Cyan'],[238,'Blue'],[265,'Indigo'],[290,'Purple'],[320,'Magenta'],[348,'Pink']];for(const[b,n]of NM)if(h<=b)return n;return 'Red';}
function distinct(rng,k){const start=rng()*360,o=[];for(let i=0;i<k;i++){const h=Math.round((start+i*360/k)%360);o.push({n:hueName(h),h});}return o;}

// ---- body helpers ----
function addBar(x1,y1,x2,y2,thick,kind,rest){const cx=(x1+x2)/2,cy=(y1+y2)/2,len=Math.hypot(x2-x1,y2-y1),ang=Math.atan2(y2-y1,x2-x1);const b=Bodies.rectangle(cx,cy,len+thick,thick,{isStatic:true,angle:ang,friction:0.002,frictionStatic:0,restitution:rest==null?0.35:rest});b.kind=kind||'bar';Composite.add(world,b);return b;}
function addPeg(x,y,r,kind,rest){const b=Bodies.circle(x,y,r,{isStatic:true,friction:0,frictionStatic:0,restitution:rest==null?0.55:rest});b.kind=kind||'peg';Composite.add(world,b);return b;}
function addSpinner(x,y,len,thick,omega){const b=Bodies.rectangle(x,y,len,thick,{isStatic:true,friction:0.002,frictionStatic:0});b.kind='spinner';b.shape={len,thick};Composite.add(world,b);spinners.push({body:b,omega});dynObs.push(b);return b;}

// ---- stations: each returns its height; entry & exit span full width so marbles always flow ----
function mRamps(y0,rng){const w=wallR-wallL,drop=w*0.42,inset=R*7,n=3;let y=y0+R*2;for(let i=0;i<n;i++){const L=i%2===0,hx=L?wallL+R*1.5:wallR-R*1.5,lx=L?wallR-inset:wallL+inset;addBar(hx,y,lx,y+drop,R*1.1,'ramp');y=y+drop+R*4;}return y-y0+R*2;}
function mPachinko(y0,rng){const w=wallR-wallL,rows=6+Math.floor(rng()*3),top=y0+R*3,sy=R*4.2,pr=R*0.95,cols=Math.max(3,Math.floor(w/(R*5))),dx=w/cols;for(let r=0;r<rows;r++){const off=(r%2)?dx/2:0;for(let c=0;c<=cols;c++){const x=wallL+off+c*dx;if(x<wallL+R*1.2||x>wallR-R*1.2)continue;addPeg(x,top+r*sy,pr,'peg');}}return rows*sy+R*5;}
function mSpinner(y0,rng){const mid=(wallL+wallR)/2,h=R*14,len=(wallR-wallL)*0.52,om=(rng()<0.5?-1:1)*(2.4+rng()*1.6);addSpinner(mid,y0+h*0.5,len,R*1.0,om);return h;}
// mBumpers: an aggressive high-speed SLALOM — bumpers staggered hard left/right so marbles rip diagonally between them (not a slow pachinko)
function mBumpers(y0,rng){const w=wallR-wallL,mid=(wallL+wallR)/2,rows=4+Math.floor(rng()*2),sy=R*6.5,top=y0+R*4;for(let r=0;r<rows;r++){const side=(r%2)?1:-1,x=mid+side*w*0.26;addPeg(x,top+r*sy,R*1.6,'bumper',0.92);addPeg(mid-side*w*0.05,top+r*sy+sy*0.5,R*1.1,'bumper',0.92);}return rows*sy+R*6;}
// connector: funnel that gathers marbles to an offset gap, then they drop to the next station
function mFunnel(y0,rng){const w=wallR-wallL,mid=(wallL+wallR)/2,gap=R*(6.5+Math.min((optN||6),40)*0.12),side=(rng()<0.5?-1:1),ex=mid+side*w*0.10,h=R*8;addBar(wallL,y0,ex-gap,y0+h,R*1.7,'wall');addBar(wallR,y0,ex+gap,y0+h,R*1.7,'wall');return h+R*2;}

// ---- NEW dynamic / varied obstacle stations ----
// pinwheel: a multi-arm spinning star (visual variety + fling)
function mPinwheel(y0,rng){const mid=(wallL+wallR)/2,h=R*15,arms=3+Math.floor(rng()*3),len=(wallR-wallL)*0.5,cy=y0+h*0.5,om=(rng()<0.5?-1:1)*(2+rng()*1.4);for(let k=0;k<arms;k++){const b=Bodies.rectangle(mid,cy,len,R*0.9,{isStatic:true,friction:0.002,frictionStatic:0,angle:Math.PI*k/arms});b.kind='spinner';b.shape={len,thick:R*0.9};Composite.add(world,b);spinners.push({body:b,omega:om});dynObs.push(b);}return h;}
// gears: two counter-rotating spinners side by side
function mGears(y0,rng){const w=wallR-wallL,h=R*15,len=w*0.34,cy=y0+h*0.5,om=2.0+rng()*1.2;addSpinner(wallL+w*0.30,cy,len,R*0.9,om);addSpinner(wallL+w*0.70,cy,len,R*0.9,-om);return h;}
// splitter: a central peak that forces marbles left OR right (path choice), then they rejoin
function mSplitter(y0,rng){const w=wallR-wallL,mid=(wallL+wallR)/2,h=R*16,peak=y0+R*3,baseY=y0+h*0.52,spread=w*0.36;addBar(mid,peak,mid-spread,baseY,R*1.1,'ramp');addBar(mid,peak,mid+spread,baseY,R*1.1,'ramp');addPeg(mid,y0+h*0.8,R*1.2,'bumper',0.7);return h;}
// trampoline: steep bouncy angled pads that fling marbles across
function mTrampoline(y0,rng){const w=wallR-wallL,n=3;let y=y0+R*3;for(let i=0;i<n;i++){const L=i%2===0,hx=L?wallL+R*1.5:wallR-R*1.5,lx=L?wallR-R*7:wallL+R*7;addBar(hx,y,lx,y+w*0.16,R*1.0,'ramp',0.92);y+=w*0.16+R*5;}return y-y0+R*2;}
// seesaw: a DYNAMIC plank pinned at its center — tips under marble weight and dumps them
function mSeesaw(y0,rng){const w=wallR-wallL,mid=(wallL+wallR)/2,h=R*14,len=w*0.62,cy=y0+h*0.5;const plank=Bodies.rectangle(mid,cy,len,R*1.3,{density:0.0025,frictionAir:0.02,friction:0.04,restitution:0.2});plank.kind='seesaw';plank.shape={len,thick:R*1.3};Composite.add(world,plank);Composite.add(world,M.Constraint.create({bodyA:plank,pointA:{x:0,y:0},pointB:{x:mid,y:cy},stiffness:1,length:0}));dynObs.push(plank);return h;}

// helper: a curved wall built from short bars along an arc
function arcWall(cx,cy,rad,a0,a1,K,kind){let prev=null;for(let i=0;i<=K;i++){const t=i/K,ang=a0+(a1-a0)*t,px=cx+Math.cos(ang)*rad,py=cy+Math.sin(ang)*rad;if(prev)addBar(prev.x,prev.y,px,py,R*1.1,kind||'wall');prev={x:px,y:py};}}

// mSplit: a central wedge forks marbles into LEFT or RIGHT lanes (different obstacles → different speeds), then they rejoin. The #1 suspense element.
function mSplit(y0,rng){
  const w=wallR-wallL,mid=(wallL+wallR)/2,h=R*24,divTop=y0+R*5,divBot=y0+h*0.74,lcx=(wallL+mid)/2,rcx=(mid+wallR)/2;
  addBar(mid,y0+R*1.5,mid-R*3.5,divTop,R*1.0,'ramp');   // wedge peak → left
  addBar(mid,y0+R*1.5,mid+R*3.5,divTop,R*1.0,'ramp');   // wedge peak → right
  addBar(mid,divTop,mid,divBot,R*1.5,'wall');           // central divider
  for(let i=0;i<3;i++)addPeg(lcx+((i%2)?R*2.4:-R*2.4),divTop+R*4+i*R*4.5,R*0.95,'peg');  // left lane: pegs (slower)
  addPeg(rcx,divTop+h*0.22,R*1.5,'bumper',0.72);        // right lane: a bumper (chaotic)
  addPeg(rcx,divTop+h*0.42,R*1.2,'bumper',0.72);
  return h;
}
// mVortex: a curved bowl — marbles pour in, swirl around the walls, and drain one-by-one through a center gap. "Who escapes first" pandemonium.
function mVortex(y0,rng){
  const mid=(wallL+wallR)/2,w=wallR-wallL,h=R*22,cx=mid,cy=y0+h*0.42,rad=w*0.40,K=12,dGap=Math.asin(Math.min(0.6,(R*2.0)/rad));
  arcWall(cx,cy,rad,Math.PI,Math.PI/2+dGap,K);   // left half of bowl
  arcWall(cx,cy,rad,Math.PI/2-dGap,0,K);          // right half of bowl
  return h;
}

// mSpiral: a DESCENDING spiral chute (whirlpool). A channel between an inner + outer wall winds inward
// AND descends monotonically, so gravity keeps marbles moving fast around the coil instead of sloshing.
function mSpiral(y0,rng){
  const mid=(wallL+wallR)/2,w=wallR-wallL,loops=2+Math.floor(rng()*2),steps=loops*42,dir=rng()<0.5?1:-1;
  const rOut=w*0.38,rIn=R*4,ch=R*3.4,perLoop=R*14,totalH=loops*perLoop+R*6,cx=mid,cy=y0+R*4;
  let pO=null,pI=null;
  for(let i=0;i<=steps;i++){
    const f=i/steps,theta=dir*f*loops*2*Math.PI,r=rOut-(rOut-rIn)*f,yy=cy+f*totalH,vo=Math.sin(theta)*r*0.28;
    const ox=cx+Math.cos(theta)*(r+ch/2),oy=yy+vo,ix=cx+Math.cos(theta)*(r-ch/2),iy=yy+vo;
    if(pO)addBar(pO.x,pO.y,ox,oy,R*1.3,'wall');
    if(pI&&i>steps*0.08)addBar(pI.x,pI.y,ix,iy,R*1.2,'wall');
    pO={x:ox,y:oy};pI={x:ix,y:iy};
  }
  return totalH+R*8;
}
// mChokeDrop: a funnel squeezes the field into a high-speed single-file stream, then a tall OBSTACLE-FREE drop to build velocity. The pacing reset + overtake setup.
function mChokeDrop(y0,rng){const mid=(wallL+wallR)/2,gap=R*(2.8+Math.min((optN||6),40)*0.10),fh=R*11,drop=R*16+rng()*R*7;addBar(wallL,y0,mid-gap,y0+fh,R*2.2,'wall');addBar(wallR,y0,mid+gap,y0+fh,R*2.2,'wall');return fh+drop;}
// mWideDrop: for big fields — an open vertical drop with no squeeze (marbles accelerate and spread, no clog)
function mWideDrop(y0,rng){return R*15+rng()*R*7;}
// mSprint (Gemini): a tall EMPTY free-fall (~1 screen) — gravity takes over, creating big speed differentials & overtakes. The "plunge" that breaks up obstacle density.
function mSprint(y0,rng){return H*(0.8+rng()*0.3);}
// mWaterfall (Gemini): a central wedge splits the pack into 3-5 near-vertical lanes — a velocity-building "race within a race". Lanes never clog (gravity pulls straight down).
function mWaterfall(y0,rng){
  const w=wallR-wallL,lanes=3+Math.floor(rng()*2),laneW=w/lanes,top=y0+R*5,h=R*22,bot=y0+h*0.9;
  for(let i=1;i<lanes;i++){const dx=wallL+laneW*i;
    addBar(dx,top-R*1.5,dx-R*1.8,top+R*1.5,R*1.0,'ramp');addBar(dx,top-R*1.5,dx+R*1.8,top+R*1.5,R*1.0,'ramp'); // splitter wedge
    addBar(dx,top+R*1.5,dx,bot,R*1.4,'wall');  // vertical lane divider
  }
  return h;
}
// mFlinger (Gemini): a free-spinning paddle (dynamic, pinned, low damping). Marbles spin it up, then it flings later marbles downward — an accelerator. Deterministic (collision-driven under a fixed seed).
function mFlinger(y0,rng){
  const mid=(wallL+wallR)/2,h=R*16,cy=y0+h*0.5,len=(wallR-wallL)*0.5;
  const bar=Bodies.rectangle(mid,cy,len,R*1.2,{density:0.004,frictionAir:0.004,friction:0.02,restitution:0.45});
  bar.kind='spinner';bar.shape={len,thick:R*1.2};Composite.add(world,bar);
  Composite.add(world,M.Constraint.create({bodyA:bar,pointA:{x:0,y:0},pointB:{x:mid,y:cy},stiffness:1,length:0}));
  dynObs.push(bar);return h;
}

const MODS=[mRamps,mPachinko,mSpinner,mBumpers,mPinwheel,mGears,mSeesaw,mSplit,mVortex];
const NAME2=new Map([[mChokeDrop,'chokedrop']]);
// ALL rotating obstacles share family 'spin' (they look alike — straight bars around an axis) so the cooldown forces real geometric variety between them
const FAM=new Map([[mRamps,'slope'],[mPachinko,'pin'],[mSpinner,'spin'],[mBumpers,'chaos'],[mPinwheel,'spin'],[mGears,'spin'],[mSeesaw,'tip'],[mSplit,'split'],[mVortex,'vortex'],[mSpiral,'spiral'],[mWaterfall,'waterfall'],[mFlinger,'spin']]);
const INT=new Map([[mRamps,1],[mPachinko,2],[mSpinner,3],[mBumpers,3],[mPinwheel,3],[mGears,3],[mSeesaw,2],[mSplit,2],[mVortex,3]]);
const NAME=new Map([[mRamps,'ramps'],[mPachinko,'pachinko'],[mSpinner,'spinner'],[mBumpers,'bumpers'],[mPinwheel,'pinwheel'],[mGears,'gears'],[mSeesaw,'seesaw'],[mSplit,'split'],[mVortex,'vortex']]);

let __only=null;function setOnly(m){__only=m;}
function buildWorld(seed){
  const rng=rngFrom(seed);
  accent=Math.floor(rng()*360);
  wallL=W*0.06;wallR=W*0.94;
  const N=optN?optN:(4+Math.floor(rng()*3));
  // marble radius shrinks as count grows so many flow in parallel; floored so they stay visible
  R=Math.max(W*0.0095,Math.min(W*0.036,(wallR-wallL)/(Math.min(N,40)*1.5)));
  engine=Engine.create({positionIterations:12,velocityIterations:10});engine.gravity.y=GRAV;world=engine.world;spinners=[];marbles=[];dynObs=[];
  prng=rngFrom((seed^0x9e3779b9)>>>0); // deterministic nudge stream
  // ---- STRUCTURED sequencer: a real course has a beginning, middle, and climax (per pacing critique) ----
  const big=N>30,mid=Math.max(6,Math.round((24+Math.floor(rng()*8))*optLen*(optMode==='elim'?1.7:1)));
  const seq=[];
  if(__only){const m=({ramps:mRamps,pach:mPachinko,spin:mSpinner,bump:mBumpers,pinwheel:mPinwheel,gears:mGears,seesaw:mSeesaw,split:mSplit,vortex:mVortex,spiral:mSpiral,waterfall:mWaterfall,flinger:mFlinger})[__only];for(let i=0;i<mid+4;i++)seq.push(m);}
  else{
    // ACT 1 — THE DROP: plunge + a velocity/spread piece. NEVER pachinko first (it kills opening momentum).
    seq.push(mWideDrop);
    seq.push(rng()<0.5?mRamps:mSplit);   // steep ramps or a lane-split spread the pack AT SPEED
    // ACT 2 — THE MINCER: varied flow, the single pachinko placed mid-race (after speed is built), ≤1 bumper, sprints for breathing room, chokepoint burst
    const pool=[mRamps,mSpinner,mGears,mSeesaw,mSplit,mPinwheel,mFlinger,mBumpers];  // spiral/vortex/waterfall removed: all empirically TRAP in gravity.
    let lf=null,lfam=null,bumpN=0,choked=false,sp1=false,sp2=false,pachDone=false,spinCD=0;
    for(let i=0;i<mid;i++){
      const frac=i/mid;
      if(!sp1&&frac>=0.22){seq.push(mSprint);sp1=true;continue;}   // sprint #1 — early plunge
      if(!pachDone&&frac>=0.38){seq.push(mPachinko);pachDone=true;continue;} // the ONE scramble, mid-race after the pack has speed
      if(!choked&&frac>=0.55){seq.push(big?mWideDrop:mChokeDrop);choked=true;continue;}
      if(!sp2&&frac>=0.72){seq.push(mSprint);sp2=true;continue;}   // sprint #2 — late plunge
      let p=pool.filter(m=>m!==lf&&FAM.get(m)!==lfam);
      if(bumpN>=1)p=p.filter(m=>m!==mBumpers);
      if(spinCD>0)p=p.filter(m=>FAM.get(m)!=='spin');  // 2-station cooldown: no two rotating obstacles near each other
      if(p.length===0)p=pool.filter(m=>m!==lf);if(p.length===0)p=pool.slice();
      const f=p[Math.floor(rng()*p.length)];if(f===mBumpers)bumpN++;
      if(FAM.get(f)==='spin')spinCD=2;else if(spinCD>0)spinCD--;
      seq.push(f);lf=f;lfam=FAM.get(f);
    }
    // CLIMAX marquee, then ACT 3 — THE SPRINT: chokepoint into a fast low-obstacle dash to the line
    seq.push(big?mGears:[mSplit,mGears,mFlinger][Math.floor(rng()*3)]);
    seq.push(big?mWideDrop:mChokeDrop);
    seq.push(mRamps);
  }
  const used=seq.slice();let y=H*0.34;
  for(let s=0;s<seq.length;s++){const f=seq[s];y+=f(y,rng);
    // light gather-funnel between flow pieces (not around chokepoints, which already funnel)
    if(!__only&&s<seq.length-1&&f!==mChokeDrop&&seq[s+1]!==mChokeDrop&&rng()<(big?0.1:0.18))y+=mFunnel(y,rng);
  }
  finishY=y+R*4;worldH=finishY+H*0.2;
  // side walls — extend well above the top so the spawn stack (which may sit above y=0 for big N) is enclosed
  const topBound=-H*Math.max(4,N/5);  // tall enough to enclose the upward spawn stack for big fields (marbles were falling out the open top)
  addBar(wallL,topBound,wallL,worldH,R*3,'sidewall');addBar(wallR,topBound,wallR,worldH,R*3,'sidewall');
  // spawn marbles in a grid (stacks upward for large counts), deterministic
  const cols=distinct(rng,N),sp2=R*2.4,perRow=Math.max(1,Math.floor((wallR-wallL-R*2)/sp2)),sy0=H*0.16;
  for(let i=0;i<N;i++){const row=Math.floor(i/perRow),idx=i%perRow,rc=Math.min(perRow,N-row*perRow),rspan=(rc-1)*sp2;
    const x=(wallL+wallR)/2-rspan/2+idx*sp2+(rng()-0.5)*R*0.3,gy=sy0-row*sp2+(rng()-0.5)*R*0.3;
    const b=Bodies.circle(x,gy,R,{restitution:0.45,friction:0.002,frictionStatic:0,frictionAir:0.0004,density:0.001});
    b.kind='marble';b.col=cols[i];b.name=N>12?cols[i].n+' '+(i+1):cols[i].n;b.fin=false;b.ft=0;marbles.push(b);Composite.add(world,b);}
  return {N,pool:used};
}

const SUBSTEPS=8;
function stepWorld(dt){
  // sub-step the physics: 8 fine ticks/frame. Low per-substep cap (0.8R) keeps fast marbles from phasing through
  // thin bars even after big drops; the 8 substeps still allow a high per-FRAME speed (~6.4R) for real drama.
  const K=SUBSTEPS,sdt=dt/K,cap=R*0.8,slow=cap*0.18;
  for(let s=0;s<K;s++){
    for(const sp of spinners)Body.rotate(sp.body,sp.omega*sdt);
    for(const m of marbles){if(m.fin)continue;const v=m.velocity,spd=Math.hypot(v.x,v.y);
      if(spd>cap){const k=cap/spd;Body.setVelocity(m,{x:v.x*k,y:v.y*k});}
      if(spd<slow){m.slowT=(m.slowT||0)+sdt;if(m.slowT>0.3){Body.setVelocity(m,{x:(prng()-0.5)*cap,y:cap*0.7});m.slowT=0;}}else m.slowT=0;
    }
    Engine.update(engine,sdt*1000);
  }
}

function simulate(seed){
  buildWorld(seed);const N=marbles.length,CAP=N>30?150:95;
  let t=0,prevLead=-1,changes=0,stall=0,maxStall=0,leadCount={},done=0;
  while(t<CAP){
    stepWorld(FIXED);t+=FIXED;
    let li=-1,by=-1e9,act=0,slow=0;
    for(const m of marbles){
      if(m.fin)continue;
      if(m.position.y>finishY){m.fin=true;m.ft=t;done++;continue;}
      act++;const sp=Math.hypot(m.velocity.x,m.velocity.y);if(sp<0.6)slow++;
      if(m.position.y>by){by=m.position.y;li=m.id;}
    }
    if(li>=0){leadCount[li]=(leadCount[li]||0)+1;if(prevLead>=0&&li!==prevLead)changes++;prevLead=li;}
    if(act>0&&slow/act>0.85){stall+=FIXED;if(stall>maxStall)maxStall=stall;}else stall=0;
    if(done>=N)break;
  }
  const fins=marbles.filter(m=>m.fin).map(m=>m.ft).sort((a,b)=>a-b);
  const allFinish=fins.length>=N,winTime=fins[0]||CAP,gap=fins.length>=2?fins[1]-fins[0]:99;
  let maxLead=0,total=0;for(const k in leadCount){total+=leadCount[k];if(leadCount[k]>maxLead)maxLead=leadCount[k];}
  return {seed,allFinish,N,finished:fins.length,winTime,lastTime:fins[fins.length-1]||CAP,gap,changes,dom:total>0?maxLead/total:1,maxJam:maxStall};
}
// ---- recordRace: simulate a seed to completion and capture a "tape" (per-frame positions/angles + sounds) for smooth playback ----
function recordRace(seed){
  buildWorld(seed);const N=marbles.length,CAP=N>30?160:100;
  const dynSet=new Set(dynObs);
  // statics: everything that never moves (drawn once during playback)
  const statics=[];
  for(const b of Composite.allBodies(world)){
    if(b.kind==='marble'||b.kind==='sidewall'||dynSet.has(b))continue;
    if(b.circleRadius)statics.push({k:b.kind,t:'c',x:b.position.x,y:b.position.y,r:b.circleRadius});
    else statics.push({k:b.kind,t:'p',v:b.vertices.map(p=>({x:+p.x.toFixed(1),y:+p.y.toFixed(1)}))});
  }
  const dynMeta=dynObs.map(b=>({k:b.kind,len:b.shape.len,thick:b.shape.thick}));
  const marbleMeta=marbles.map(m=>({h:m.col.h,name:m.name}));
  // collision sounds, tagged with the frame they occur on
  const sounds=[],impacts=[];let frameIdx=0;
  M.Events.on(engine,'collisionStart',ev=>{for(const p of ev.pairs){const a=p.bodyA,b=p.bodyB,m=a.kind==='marble'?a:(b.kind==='marble'?b:null);if(!m)continue;const o=m===a?b:a;const sp=Math.hypot(m.velocity.x,m.velocity.y);if(sp<R*0.05)continue;sounds.push({f:frameIdx,bump:o.kind==='bumper',sp:+(sp/R).toFixed(3)});
    // strong impacts → spark/flash events for playback "juice" (throttled so the tape stays small)
    if(sp>R*0.075&&impacts.length<3000)impacts.push({f:frameIdx,x:+m.position.x.toFixed(1),y:+m.position.y.toFixed(1),s:+Math.min(1,Math.max(0,(sp/R-0.055)/0.05)).toFixed(2),h:m.col.h,bump:o.kind==='bumper'?1:0});}});
  const elim=optMode==='elim';
  const elimEvery=Math.max(1.2,38/Math.max(1,N)),grace=3.5;let lastElim=0;const elims=[];
  const frames=[];let t=0,winner=null;const finishOrder=[];
  while(t<CAP){
    frameIdx=frames.length;
    stepWorld(FIXED);t+=FIXED;
    if(elim){
      // periodically knock out the rearmost (last-place) marble until one survivor remains
      const active=marbles.filter(m=>!m.fin);
      if(active.length>1&&t>grace&&t-lastElim>=elimEvery){let worst=active[0];for(const m of active)if(m.position.y<worst.position.y)worst=m;worst.fin=true;M.Composite.remove(world,worst);const wi=marbles.indexOf(worst);elims.push({f:frameIdx,idx:wi,name:worst.name});lastElim=t;}
      const rem=marbles.filter(m=>!m.fin);
      if(rem.length<=1){if(rem.length===1){winner=rem[0];winner.ft=t;}}
      // also: a marble reaching the finish survives outright (rare in elim — course is long)
      for(const m of marbles){if(m.fin)continue;if(m.position.y>finishY){winner=m;m.fin=true;m.ft=t;}}
    } else {
      for(const m of marbles){if(m.fin)continue;if(m.position.y>finishY){m.fin=true;m.ft=t;finishOrder.push(marbles.indexOf(m));if(!winner)winner=m;}}
    }
    frames.push({
      m:marbles.map(m=>({x:+m.position.x.toFixed(1),y:+m.position.y.toFixed(1),vx:+m.velocity.x.toFixed(2),f:m.fin?1:0})),
      d:dynObs.map(b=>({x:+b.position.x.toFixed(1),y:+b.position.y.toFixed(1),a:+b.angle.toFixed(3)}))
    });
    if(elim){if(winner||marbles.filter(m=>!m.fin).length<=1){if(!winner){const r=marbles.filter(m=>!m.fin);if(r.length){winner=r[0];winner.ft=t;}}break;}}
    else if(marbles.every(m=>m.fin))break;
  }
  const winX=winner?winner.position.x:wallL+(wallR-wallL)/2,winY=winner?Math.min(winner.position.y,finishY):finishY,winFrame=winner?Math.max(0,Math.round((winner.ft||t)*60)):frames.length-1;
  return {seed,R,accent,wallL,wallR,finishY,worldH,N,mode:elim?'elim':'race',marbleMeta,dynMeta,statics,frames,sounds,impacts,elims,winX,winY,winFrame,
    winIdx:winner?marbles.indexOf(winner):0,winTime:winner?winner.ft:t,finishOrder,frameCount:frames.length};
}

function scoreRace(m){return m.changes*3+Math.max(0,6-m.gap)*1.5-Math.abs(m.winTime-58)*0.15-Math.max(0,m.dom-0.55)*22;}
function pickGoodSeed(TRIES){
  if(optN>30)return{seed:Math.floor(Math.random()*1e9),passed:true,m:null}; // big fields: skip the 8× sim (would block); they're inherently chaotic
  TRIES=TRIES||16;const MINT=30,MAXT=85,JAM=2.2;let bestPass=null,bestAny=null;for(let i=0;i<TRIES;i++){const seed=Math.floor((typeof PRSEED!=='undefined'?PRSEED():Math.random())*1e9),m=simulate(seed),sc=scoreRace(m);const req=m.N<=12?m.N:Math.ceil(m.N*0.88);const pass=m.finished>=req&&m.winTime>=MINT&&m.winTime<=MAXT&&m.maxJam<JAM;if(!bestAny||sc>bestAny.sc)bestAny={seed,sc,m};if(pass&&(!bestPass||sc>bestPass.sc))bestPass={seed,sc,m};}const c=bestPass||bestAny;c.passed=!!bestPass;return c;}

if(typeof window!=='undefined')window.MR={recordRace,pickGoodSeed,simulate,setDim:(w,h)=>{W=w;H=h;},setGrav:g=>{GRAV=g;},setOpt:(n,l,m)=>{optN=n;optLen=l==null?1:l;optMode=m||'race';}};
if(typeof module!=='undefined')module.exports={setOnly,buildWorld,stepWorld,simulate,recordRace,scoreRace,pickGoodSeed,
  setDim:(w,h)=>{W=w;H=h;},setGrav:g=>{GRAV=g;},setOpt:(n,l,m)=>{optN=n;optLen=l==null?1:l;optMode=m||"race";},penRun:(seed,K)=>{buildWorld(seed);const stat=Composite.allBodies(world).filter(b=>b.kind!=="marble");let t=0,deep=0,frames=0;while(t<140){stepWorld(FIXED);t+=FIXED;frames++;if(frames%2)continue;for(const m of marbles){if(m.fin){continue;}if(m.position.y>finishY){m.fin=true;continue;}const cols=M.Query.collides(m,stat);for(const c of cols){if(c.depth>R*0.55){deep++;break;}}}if(marbles.every(x=>x.fin))break;}return{deepPenetrations:deep,finished:marbles.filter(m=>m.fin).length,total:marbles.length};},checkRun:(seed)=>{buildWorld(seed);let esc=0,t=0;const lo=wallL-R*4,hi=wallR+R*4;while(t<140){stepWorld(FIXED);t+=FIXED;let done=0;for(const m of marbles){if(m.fin){done++;continue;}if(m.position.x<lo||m.position.x>hi||m.position.y>worldH+H){esc++;m.fin=true;m.escaped=true;}else if(m.position.y>finishY){m.fin=true;}}if(marbles.every(m=>m.fin))break;}return{escaped:marbles.filter(m=>m.escaped).length,total:marbles.length,finished:marbles.filter(m=>m.fin&&!m.escaped).length};},
  get marbles(){return marbles;},get finishY(){return finishY;},get worldH(){return worldH;},get H(){return H;}};
