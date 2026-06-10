// Generates a deterministic race "tape" (JSON) for the Blender renderer. No browser needed.
// usage: node make-tape.js <seed|rand> <N> <len> <race|elim> <out.json>
const fs=require('fs');
const G=require('./mr5.js');
const [,,seedArg='rand',nArg='12',lenArg='1',modeArg='race',outArg='tape.json']=process.argv;
G.setDim(432,768);G.setGrav(1.8);G.setOpt(parseInt(nArg)||12,parseFloat(lenArg)||1,modeArg);
let seed;
if(seedArg&&seedArg!=='rand')seed=parseInt(seedArg);
else if(modeArg==='elim'||(parseInt(nArg)||12)>24)seed=Math.floor(Math.random()*1e9);
else seed=G.pickGoodSeed(8).seed;
const rec=G.recordRace(seed);
fs.writeFileSync(outArg,JSON.stringify(rec));
console.error(`tape -> ${outArg} | seed ${seed.toString(36)} | ${rec.frames.length} frames (${(rec.frames.length/60).toFixed(1)}s) | N=${rec.N} | winner ${rec.marbleMeta[rec.winIdx].name} | statics ${rec.statics.length} dyn ${rec.dynMeta.length}`);
