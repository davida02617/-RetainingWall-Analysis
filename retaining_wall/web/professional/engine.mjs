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
    if(['name','wall_type','foundation','bearing_source','regulation','design_basis','soil_source','seismic_source','model_source','load_source','movement'].includes(k)) {
      if(typeof v!=='string'||Array.from(v).length>200)throw Error(`${k} 必須為 200 字內文字`);
    }else if(v===null&&['allowable_bearing','ultimate_bearing','allowable_bearing_seismic','ultimate_bearing_seismic','overburden_pressure','exposed_height'].includes(k))continue;
    else if(typeof v!=='number'||!Number.isFinite(v))throw Error(`${k} 必須為有限數值`);
  }
  for(const k of ['height','base_thickness','toe','heel','stem_top','stem_bottom'])if(abs(w[k])>100)throw Error(`${k} 超過本版 100 m 分析範圍`);
  for(const k of ['gamma_concrete','gamma_soil'])if(w[k]>50)throw Error(`${k} 超過本版 50 kN/m³ 範圍`);
  for(const k of ['surcharge','allowable_bearing','ultimate_bearing','allowable_bearing_seismic','ultimate_bearing_seismic','overburden_pressure'])if(w[k]!==null&&abs(w[k])>1e6)throw Error(`${k} 超過本版 1e6 kPa 範圍`);
  if(!w.name.trim())throw Error('斷面名稱不得空白');
  if(!['cantilever','gravity'].includes(w.wall_type)||!['soil','rock'].includes(w.foundation))throw Error('不支援的牆型或基礎種類');
  if(!Object.hasOwn(MODEL.profiles,w.regulation)||!Object.hasOwn(MODEL.movements,w.movement))throw Error('不支援的法規或位移模式');
  if(w.exposed_height!==null&&!(w.exposed_height>0&&w.exposed_height<=w.height+w.base_thickness))throw Error('有效露出高度須大於零且不得超過斷面總高');
  if(w.overburden_pressure!==null&&w.overburden_pressure<0)throw Error('開挖前覆土壓力不得為負');
  for(const k of ['ultimate_bearing','ultimate_bearing_seismic'])if(w[k]!==null&&w.overburden_pressure!==null&&w[k]<=w.overburden_pressure)throw Error('gross 極限承載力須大於開挖前覆土壓力');
  for(const k of ['height','base_thickness','stem_top','stem_bottom','gamma_concrete','gamma_soil'])if(w[k]<=0)throw Error(`${k} 必須大於零`);
  if(min(w.toe,w.heel,w.surcharge)<0||w.stem_top>w.stem_bottom)throw Error('趾、踵、載重不得為負；牆頂厚不得超過牆底厚');
  if(!(w.phi>=0&&w.phi<50&&w.friction>=0&&w.friction<=1&&w.kh>=0&&w.kh<=.5&&w.kv>=0&&w.kv<.5))throw Error('φ 需為 0–<50°、μ 為 0–1、kh 為 0–0.5、|kv| 為 0–<0.5');
  for(const k of ['allowable_bearing','ultimate_bearing','allowable_bearing_seismic','ultimate_bearing_seismic'])if(w[k]!==null&&w[k]<=0)throw Error(`${k} 必須大於零或留空`);
  for(const k of ['groundwater_height','backfill_slope','cohesion','wall_friction'])if(w[k]!==0)throw Error(`本版未支援 ${k} 非零；不得以乾土模式代算`);
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
export function check(value,limit,upper=false,strict=false,basis='') {
  const ok=value!==null&&limit!==null&&(upper?value<=limit:strict?value>limit:value>=limit);
  return {value,limit,operator:upper?'≤':strict?'>':'≥',basis,status:value===null||limit===null?'pending':ok?'pass':'fail'};
}
const caseId=(seismic,kv,loading)=>(seismic?'E':'S')+':'+(kv>0?'positive':kv<0?'negative':'zero')+':'+loading;
export function analyzeCase(w,seismic=false,kv=0,loading='lateral_only') {
  const h=w.height,t=w.base_thickness,b=w.toe+w.stem_bottom+w.heel,rear=w.toe+w.stem_bottom;
  const polygon=[[w.toe,t],[rear,t],[rear,t+h],[rear-w.stem_top,t+h]];
  const [area,cx,cy]=centroid(polygon);
  const loads=[{name:'底版',weight:b*t*w.gamma_concrete,x:b/2,y:t/2},{name:'牆身',weight:area*w.gamma_concrete,x:cx,y:cy},{name:'踵上背填土',weight:w.heel*h*w.gamma_soil,x:rear+w.heel/2,y:t+h/2}];
  const H=h+t,q=loading==='none'?0:w.surcharge;
  if(loading==='full')loads.push({name:'踵上均佈載重',weight:q*w.heel,x:rear+w.heel/2,y:H});
  const kh=seismic?w.kh:0,k=coefficient(w.phi,kh,kv),ka=coefficient(w.phi);
  const pa=.5*ka*w.gamma_soil*H**2,total=.5*k*w.gamma_soil*H**2*(1-kv),delta=total-pa,pq=k*q*H*(1-kv);
  const [ya,yd]=!seismic||(kh===0&&kv===0)?[1/3,1/3]:{toe_rotation:[1/3,2/3],translation:[.42,.48],top_rotation:[.55,.55]}[w.movement];
  const soilMoment=(pa*ya+delta*yd)*H,earthY=soilMoment/total;
  if(!(earthY>=0&&earthY<=H))throw Error('地震土壓合力作用點超出牆高；此增量分配模型不適用');
  const me=soilMoment+pq*H/2,ih=sum(loads.map(v=>v.weight))*kh,mi=sum(loads.map(v=>v.weight*kh*v.y));
  const n=sum(loads.map(v=>v.weight))*(1-kv),mr=sum(loads.map(v=>v.weight*v.x))*(1-kv),mo=me+mi,horizontal=total+pq+ih,x=(mr-mo)/n,e=b/2-x;
  const pressure=contact(n,b,x),qmax=pressure.qmax,building=['building','both'].includes(w.regulation),swc=['swc','both','unconfirmed'].includes(w.regulation);
  const bearingLimit=seismic&&w.regulation==='building'?2:3,bearingStrict=building&&!(seismic&&w.regulation==='both');
  const qa=seismic&&w.allowable_bearing_seismic!==null?w.allowable_bearing_seismic:w.allowable_bearing;
  const qult=seismic&&w.ultimate_bearing_seismic!==null?w.ultimate_bearing_seismic:w.ultimate_bearing,q0=w.overburden_pressure;
  const fsGross=qult!==null&&qmax?qult/qmax:null,fsNet=qult!==null&&q0!==null&&qmax!==null&&qmax>q0?(qult-q0)/(qmax-q0):null;
  const fsBearing=w.regulation==='both'&&fsNet!==null?min(fsGross,fsNet):building?fsNet:fsGross;
  const legalBasis=w.regulation==='both'?'水保 §120；基礎規範 §7.4':building?'基礎規範 §7.4':'水保 §120';
  const eLimit=b/(swc&&!building&&w.foundation==='rock'?4:6);
  const checks={
    overturning:check(mo>0?mr/mo:null,seismic?1.5:2,false,building,legalBasis),
    sliding:check(horizontal>0?w.friction*n/horizontal:null,seismic?1.2:1.5,false,building,legalBasis),
    eccentricity:check(abs(e),eLimit,true,false,swc&&!building?'水保 §120':'本模型採 B/6 不受拉條件'+(swc?'；並滿足水保 §120':'')),
    bearing_allowable:check(qmax,qa,true,false,'使用者地勘 gross qa；建築構造編 §121-3／水保 §120'),
    bearing_fs:check(fsBearing,bearingLimit,false,bearingStrict,legalBasis+(building?'；淨值依 §4.3.5':'；gross 比值'))
  };
  if(pressure.mode==='unstable')for(const k of ['bearing_allowable','bearing_fs'])checks[k].status='fail';
  if(!w.bearing_source.trim())for(const k of ['bearing_allowable','bearing_fs'])if(checks[k].status==='pass')checks[k].status='pending';
  if(w.regulation==='unconfirmed')for(const v of Object.values(checks))if(v.status==='pass')v.status='pending';
  const missing=[[w.design_basis,'案件法規適用依據'],[w.soil_source,'土壤與摩擦參數來源'],[w.model_source,'乾土及主動位移條件依據']].filter(([v])=>!v.trim()).map(([,label])=>label);
  if(seismic&&!w.seismic_source.trim())missing.push('工址地震參數來源');
  if(w.surcharge>0&&!w.load_source.trim())missing.push('載重性質與組合依據');
  const statuses=Object.values(checks).map(v=>v.status),status=statuses.includes('fail')?'fail':statuses.includes('pending')||missing.length?'pending':'pass';
  return {case:seismic?'seismic':'static',kv,id:caseId(seismic,kv,loading),loading,status,checks,missing,width:b,earth_height:H,earth_application_height:earthY,static_height_ratio:ya,delta_height_ratio:yd,ka,kae:k,normal:n,earth_force:total,static_earth_force:pa,delta_earth_force:delta,surcharge_force:pq,inertia_force:ih,horizontal,resisting_moment:mr,overturning_moment:mo,resultant_x:x,eccentricity:e,bearing:{qa,qult,q0,fs_gross:fsGross,fs_net:fsNet},pressure,loads,stem_polygon:polygon};
}
export function envelope(cases) {
  const result={};
  for(const key of ['overturning','sliding','eccentricity','bearing_allowable','bearing_fs']) {
    const valid=cases.filter(c=>c.checks&&c.checks[key].value!==null),upper=['eccentricity','bearing_allowable'].includes(key);
    const ratio=c=>c.checks[key].limit?c.checks[key].value/c.checks[key].limit:c.checks[key].value;
    let governing=valid.reduce((best,c)=>!best||(upper?ratio(c)>ratio(best):ratio(c)<ratio(best))?c:best,null);
    const unresolved=cases.filter(c=>!c.checks||c.checks[key].status==='fail'&&c.checks[key].value===null);
    const failed=cases.filter(c=>c.checks&&c.checks[key].status==='fail'),invalidFailed=failed.filter(c=>c.checks[key].value===null);
    if(invalidFailed.length)governing=invalidFailed[0];
    else if(unresolved.length&&!failed.length)governing=unresolved[0];
    const statuses=cases.map(c=>c.checks?c.checks[key].status:'unsupported');
    const status=statuses.includes('fail')?'fail':statuses.includes('unsupported')?'unsupported':statuses.includes('pending')?'pending':'pass';
    result[key]={value:governing?.checks?governing.checks[key].value:null,case_id:governing?governing.id:null,status};
  }
  return result;
}
export function analyze(data) {
  const w=parseWall(data);
  const run=(seismic=false,kv=0,loading='lateral_only')=>{
    try{return analyzeCase(w,seismic,kv,loading);}catch(e){return {case:seismic?'seismic':'static',kv,loading,id:caseId(seismic,kv,loading),status:'unsupported',error:e.message};}
  };
  const normal=run(),directions=[...new Set([w.kv,-w.kv])].sort((a,b)=>a-b),seismic=directions.map(kv=>run(true,kv)),additional=[];
  if(w.surcharge>0)for(const loading of w.heel>0?['none','full']:['none']){additional.push(run(false,0,loading));additional.push(...directions.map(kv=>run(true,kv,loading)));}
  const cases=[normal,...seismic,...additional],heightLimit=w.wall_type==='gravity'?4:8,swc=['swc','both'].includes(w.regulation);
  const heightReview={status:'pending',value:w.exposed_height,limit:swc?heightLimit:null,reason:swc?'水保 §118 以有效露出高度為準；超過原則高度需專業技師安全分析。':'高度適用條件由案件確認。'};
  if(swc&&w.exposed_height!==null)heightReview.status=w.exposed_height<=heightLimit?'pass':'pending';
  return {engine_version:MODEL.version,input:w,static:normal,seismic,additional_cases:additional,envelope:envelope(cases),height_review:heightReview,regulation:{id:w.regulation,name:MODEL.profiles[w.regulation],review_date:MODEL.review_date},references:structuredClone(MODEL.references),outstanding:structuredClone(MODEL.outstanding),rc:{...MODEL.rc},overall_status:'incomplete',source:MODEL.source,assumptions:[...MODEL.assumptions]};
}
export function presets(){return MODEL.presets.map(w=>({...w}));}
