// Local planar simulation only. No SDK, network, GPS subscription or app import.
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const validFix=f=>f&&[f.x,f.y,f.at,f.accuracy].every(Number.isFinite)&&f.at>=0&&f.accuracy>=0;
export const laboratoryPolicies=Object.freeze([
  {name:'lab-100m-15s',reserve:100,minInterval:15000},
  {name:'lab-250m-30s',reserve:250,minInterval:30000},
  {name:'lab-500m-60s',reserve:500,minInterval:60000},
]);
export function reconcileAnchor(previous,next,anchor){
  const ids=new Set(next.map(r=>r.id));
  let id=anchor?.id;
  if(!ids.has(id)){
    const start=Math.max(0,previous.findIndex(r=>r.id===id));
    id=previous.slice(start).find(r=>ids.has(r.id))?.id??next[0]?.id??null;
  }
  return {id,index:next.findIndex(r=>r.id===id),offset:id===anchor?.id?anchor.offset:0};
}
export class MovementLab {
  constructor(rows,{radius,policy,publicationCutoff=0,pageSize=50}){
    if(!Number.isFinite(radius)||radius<=0||!policy||policy.reserve<=0||policy.minInterval<=0||pageSize<1||pageSize>50)throw Error('explicit-laboratory-policy-required');
    this.rows=rows;this.radius=radius;this.policy=policy;this.cutoff=publicationCutoff;this.pageSize=pageSize;
    this.cells=new Map();this.metadataCache=new Set();this.bodyCache=new Set();this.visible=[];
    this.stats={fixes:0,ignoredFixes:0,backendCalls:0,cellVisits:0,modeledMetadataBlockLoads:0,metadataCacheHits:0,distanceChecks:0,modeledBodyLoads:0,modeledBodyBytes:0,maxDistanceBeforeRebase:0};
    for(const row of rows){const key=`${Math.floor(row.x/1000)}:${Math.floor(row.y/1000)}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(row);}
  }
  select(fix){
    // Visit cells by a true lower bound; geohash/string order is not distance.
    const candidates=[...this.cells].map(([key,rows])=>{
      const [x,y]=key.split(':').map(Number),dx=Math.max(x*1000-fix.x,0,fix.x-(x+1)*1000),dy=Math.max(y*1000-fix.y,0,fix.y-(y+1)*1000);
      return {key,rows,min:Math.hypot(dx,dy)};
    }).filter(c=>c.min<=this.radius).sort((a,b)=>a.min-b.min);
    const selected=[];
    for(const cell of candidates){
      if(selected.length===this.pageSize&&cell.min>selected.at(-1).distance)break;
      this.stats.cellVisits++;
      if(this.metadataCache.has(cell.key))this.stats.metadataCacheHits++;
      else{this.stats.modeledMetadataBlockLoads++;this.metadataCache.add(cell.key);}
      for(const row of cell.rows){
        if(row.createdAt>this.cutoff||row.expiresAt<=fix.at)continue;
        this.stats.distanceChecks++;const d=distance(row,fix);
        if(d<=this.radius)selected.push({...row,distance:d});
      }
      selected.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));selected.length=Math.min(selected.length,this.pageSize);
    }
    return selected;
  }
  accept(fix){
    this.stats.fixes++;
    if(!validFix(fix)||this.lastFix&&fix.at<=this.lastFix.at){this.stats.ignoredFixes++;return false;}
    this.lastFix=fix;
    if(this.center){
      const moved=distance(fix,this.center);this.stats.maxDistanceBeforeRebase=Math.max(this.stats.maxDistanceBeforeRebase,moved);
      // Conservative uncertainty disks plus a candidate reserve/cooldown.
      // These are explicit lab alternatives, not approved product thresholds.
      if(moved<=this.center.accuracy+fix.accuracy+this.policy.reserve||fix.at-this.center.at<this.policy.minInterval)return false;
    }
    const next=this.select(fix);
    for(const row of next){
      const key=`${row.id}:${row.version}`;
      if(!this.bodyCache.has(key)){this.bodyCache.add(key);this.stats.modeledBodyLoads++;this.stats.modeledBodyBytes+=Buffer.byteLength(row.text,'utf8');}
    }
    this.anchor=reconcileAnchor(this.visible,next,this.anchor??{id:this.visible[0]?.id,offset:24});
    this.visible=next;this.center={...fix};this.stats.backendCalls++;return true;
  }
  // New publications are deliberately separate from geographic membership.
  pending(fix){return this.rows.filter(r=>r.createdAt>this.cutoff&&r.createdAt<=fix.at&&r.expiresAt>fix.at&&distance(r,fix)<=this.radius).length;}
}
export function syntheticRows(count=2000){
  let seed=0x12345678;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  return Array.from({length:count},(_,i)=>({id:`synthetic-${String(i).padStart(4,'0')}`,x:-10000+random()*60000,y:-10000+random()*20000,createdAt:0,expiresAt:86400000,version:1,text:`Synthetic content ${i}. `.repeat(12)}));
}
export function simulate({kind,radius,policy,duration=1200000}){
  const lab=new MovementLab(syntheticRows(),{radius,policy});
  const speed=kind==='train'?100/3.6:kind==='walk'?1.4:0;
  for(let at=0;at<=duration;at+=1000)lab.accept({x:speed*at/1000+15*Math.sin(at/1700),y:10*Math.cos(at/2300),accuracy:25,at});
  return {kind,radiusMeters:radius,policy:policy.name,durationMillis:duration,speedMetersPerSecond:speed,publicationCutoffUnchanged:lab.cutoff===0,visible:lab.visible.length,...lab.stats};
}
export function report(){return {
  scope:'Local synthetic planar model; no real positions, SDK, network or writes. Disabled in the app.',
  limits:['Counts are model operations, not measured Firestore reads/billing/latency or a 5000-user capacity proof.',
    'Metadata version validation, signed cursor rebase, Auth/App Check, read-state synchronization and concurrent mutations are not implemented here.',
    'Candidate grid is a lab stand-in for existing geospatial blocks. No changes to live schemas or quotas.',
    'Metadata/body caches retain this finite 2000-row fixture; this does not validate production cache eviction.',
    'Accuracy disks cannot guarantee true device location. Missing/inaccurate fixes need a product fallback.',
    'A rebase API must preserve publication cutoff and read policy separately; existing point-bound cursors cannot simply be reused.'],
  scenarios:[5000,50000].flatMap(radius=>laboratoryPolicies.flatMap(policy=>['standing','walk','train'].map(kind=>simulate({kind,radius,policy})))),
};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const value=report(),args=process.argv.slice(2);
  if(args.length&&!(args.length===2&&args[0]==='--output'))throw Error('explicit-output-option-required');
  if(args.length)writeFileSync(args[1],JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify(value));
}
