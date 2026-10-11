// Browser implementation of retaining_wall/core.py; parity-tested against Python.
import { MODEL } from './model-data.mjs';
const {sin,cos,tan,sqrt,atan2,abs,min,max}=Math;
const radians=v=>v*Math.PI/180;
const sum=xs=>xs.reduce((a,b)=>a+b,0);
export function parseWall(data) {
  if(data===null || typeof data!=='object' || Array.isArray(data)) throw Error('斷面必須是 JSON 物件');
  const unknown=Object.keys(data).filter(k=>!Object.hasOwn(MODEL.defaults,k));
  if(unknown.length)throw Error('未知參數：'+unknown.sort().join(', '));
  const w={...MODEL.defaults,...data};
  for(const [k,v] of Object.entries(w)) {
    if(['name','wall_type','foundation','bearing_source'].includes(k)) {
      if(typeof v!=='string'||Array.from(v).length>200)throw Error(`${k} 必須為 200 字內文字`);
    }else if(v===null&&['allowable_bearing','ultimate_bearing'].includes(k))continue;
    else if(typeof v!=='number'||!Number.isFinite(v))throw Error(`${k} 必須為有限數值`);
  }
  for(const k of ['height','base_thickness','toe','heel','stem_top','stem_bottom'])if(abs(w[k])>100)throw Error(`${k} 超過本版 100 m 分析範圍`);
  for(const k of ['gamma_concrete','gamma_soil'])if(w[k]>50)throw Error(`${k} 超過本版 50 kN/m³ 範圍`);
  for(const k of ['surcharge','allowable_bearing','ultimate_bearing'])if(w[k]!==null&&abs(w[k])>1e6)throw Error(`${k} 超過本版 1e6 kPa 範圍`);
  if(!w.name.trim())throw Error('斷面名稱不得空白');
  if(!['cantilever','gravity'].includes(w.wall_type)||!['soil','rock'].includes(w.foundation))throw Error('不支援的牆型或基礎種類');
  for(const k of ['height','base_thickness','stem_top','stem_bottom','gamma_concrete','gamma_soil'])if(w[k]<=0)throw Error(`${k} 必須大於零`);
  if(min(w.toe,w.heel,w.surcharge)<0||w.stem_top>w.stem_bottom)throw Error('趾、踵、載重不得為負；牆頂厚不得超過牆底厚');
  if(!(w.phi>=0&&w.phi<50&&w.friction>=0&&w.friction<=1&&w.kh>=0&&w.kh<=.5&&w.kv>=0&&w.kv<.5))throw Error('φ 需為 0–<50°、μ 為 0–1、kh 為 0–0.5、|kv| 為 0–<0.5');
  for(const k of ['allowable_bearing','ultimate_bearing'])if(w[k]!==null&&w[k]<=0)throw Error(`${k} 必須大於零或留空`);
  for(const k of ['groundwater_height','backfill_slope','cohesion','wall_friction'])if(w[k]!==0)throw Error(`V0.1 未支援 ${k} 非零；不得以乾土模式代算`);
  return w;
}
export function coefficient(phi,kh=0,kv=0) {
  const p=radians(phi);
  if(kh===0)return tan(radians(45)-p/2)**2;
  const theta=atan2(kh,1-kv);
  if(theta>=p)throw Error('地震 θ ≥ φ，Mononobe–Okabe 無可用解');
  return cos(p-theta)**2/(cos(theta)**2*(1+sqrt(sin(p)*sin(p-theta)/cos(theta)))**2);
}
export function centroid(points) {
  const cross=points.map(([x,y],i)=>{const [u,v]=points[(i+1)%points.length];return x*v-u*y;});
  const area2=sum(cross);
  if(abs(area2)<1e-12)throw Error('退化斷面');
  const cx=sum(cross.map((c,i)=>(points[i][0]+points[(i+1)%points.length][0])*c))/(3*area2);
  const cy=sum(cross.map((c,i)=>(points[i][1]+points[(i+1)%points.length][1])*c))/(3*area2);
  return [abs(area2)/2,cx,cy];
}
export function contact(n,b,x) {
  if(n<=0||!(x>0&&x<b))return {mode:'unstable',qmax:null,qmin:null,contact_width:0};
  const e=b/2-x;
  if(abs(e)<=b/6+1e-12)return {mode:'full',qmax:n/b*(1+6*abs(e)/b),qmin:max(0,n/b*(1-6*abs(e)/b)),contact_width:b};
  const width=3*min(x,b-x);
  return {mode:'partial',qmax:2*n/width,qmin:0,contact_width:width};
}
const check=(value,limit,upper=false)=>({value,limit,status:value===null?'pending':((upper?value<=limit:value>=limit)?'pass':'fail')});
export function analyzeCase(w,seismic=false,kv=0) {
  const h=w.height,t=w.base_thickness,b=w.toe+w.stem_bottom+w.heel,rear=w.toe+w.stem_bottom;
  const polygon=[[w.toe,t],[rear,t],[rear,t+h],[rear-w.stem_top,t+h]];
  const [area,cx,cy]=centroid(polygon);
  const loads=[{name:'底版',weight:b*t*w.gamma_concrete,x:b/2,y:t/2},{name:'牆身',weight:area*w.gamma_concrete,x:cx,y:cy},{name:'踵上背填土',weight:w.heel*h*w.gamma_soil,x:rear+w.heel/2,y:t+h/2}];
  const H=h+t,kh=seismic?w.kh:0,k=coefficient(w.phi,kh,kv),ka=coefficient(w.phi);
  const pa=.5*ka*w.gamma_soil*H**2,total=.5*k*w.gamma_soil*H**2*(1-kv),delta=total-pa,pq=k*w.surcharge*H;
  const me=pa*H/3+delta*.6*H+pq*H/2,ih=sum(loads.map(v=>v.weight))*kh,mi=sum(loads.map(v=>v.weight*kh*v.y));
  const n=sum(loads.map(v=>v.weight))*(1-kv),mr=sum(loads.map(v=>v.weight*v.x))*(1-kv),mo=me+mi,horizontal=total+pq+ih,x=(mr-mo)/n,e=b/2-x;
  const pressure=contact(n,b,x),qmax=pressure.qmax;
  const checks={overturning:check(mo>0?mr/mo:null,seismic?1.5:2),sliding:check(horizontal>0?w.friction*n/horizontal:null,seismic?1.2:1.5),eccentricity:check(abs(e),b/(w.foundation==='rock'?4:6),true),bearing_allowable:w.allowable_bearing!==null?check(qmax,w.allowable_bearing,true):check(null,null),bearing_fs:check(w.ultimate_bearing!==null&&qmax?w.ultimate_bearing/qmax:null,3)};
  if(pressure.mode==='unstable')for(const k of ['bearing_allowable','bearing_fs'])checks[k].status='fail';
  if(!w.bearing_source.trim())for(const k of ['bearing_allowable','bearing_fs'])if(checks[k].status==='pass')checks[k].status='pending';
  const statuses=Object.values(checks).map(v=>v.status),status=statuses.includes('fail')?'fail':statuses.includes('pending')?'pending':'pass';
  return {case:seismic?'seismic':'static',kv,status,checks,width:b,earth_height:H,ka,kae:k,normal:n,earth_force:total,static_earth_force:pa,delta_earth_force:delta,surcharge_force:pq,inertia_force:ih,horizontal,resisting_moment:mr,overturning_moment:mo,resultant_x:x,eccentricity:e,pressure,loads,stem_polygon:polygon};
}
export function analyze(data) {
  const w=parseWall(data),normal=analyzeCase(w),seismic=[...new Set([w.kv,-w.kv])].sort((a,b)=>a-b).map(kv=>{
    try{return analyzeCase(w,true,kv);}catch(e){return {case:'seismic',kv,status:'unsupported',error:e.message};}
  });
  return {engine_version:MODEL.version,input:w,static:normal,seismic,rc:{...MODEL.rc},overall_status:'incomplete',source:MODEL.source,assumptions:[...MODEL.assumptions]};
}
export function presets(){return MODEL.presets.map(w=>({...w}));}
