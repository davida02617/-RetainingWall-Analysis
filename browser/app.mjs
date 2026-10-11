import {analyze,presets} from './engine.mjs';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=3)=>v==null?'—':Number(v).toFixed(n);
const names={pass:'符合本項',fail:'不符合',pending:'待確認',unsupported:'無法計算'};
const badge=s=>`<span class="badge ${s}">${names[s]||esc(s)}</span>`;
const groups=[['斷面尺寸',[['name','計畫／斷面名稱','text'],['wall_type','牆型','type'],['height','牆身高 m','自底版頂至牆頂'],['base_thickness','底版厚 m'],['toe','牆趾長 m'],['heel','後踵長 m'],['stem_top','牆頂厚 m'],['stem_bottom','牆底厚 m']]],['土壤與荷載',[['gamma_soil','土壤單位重 kN/m³'],['gamma_concrete','混凝土單位重 kN/m³'],['phi','土壤摩擦角 °'],['friction','基底摩擦係數 μ'],['surcharge','均佈載重 kPa'],['foundation','基礎種類','foundation']]],['地震參數',[['kh','水平地震係數 kh'],['kv','垂直地震係數 |kv|','自動分析正、負方向']]],['地盤承載力',[['allowable_bearing','容許承載力 qa kPa'],['ultimate_bearing','極限承載力 qult kPa'],['bearing_source','報告／頁碼／計算方法','text']]],['適用條件',[['groundwater_height','地下水高 m'],['backfill_slope','背填坡度 °'],['cohesion','凝聚力 kPa'],['wall_friction','牆背摩擦角 °']]]];
const labels={overturning:'傾覆 FS',sliding:'滑動 FS',eccentricity:'偏心距 |e| (m)',bearing_allowable:'最大壓力 qmax (kPa)',bearing_fs:'承載 FS＝qult/qmax'};
const formula='Ka＝tan²(45°−φ/2)\nθ＝atan[kh/(1−kv)]\nKae＝cos²(φ−θ) / {cos²θ·[1+√(sinφ·sin(φ−θ)/cosθ)]²}\nPa＝0.5·Ka·γ·H²；Pae＝0.5·Kae·γ·H²·(1−kv)\nMa＝Pa·H/3＋(Pae−Pa)·0.6H＋Kae·q·H²/2\nN＝ΣW·(1−kv)；Mr＝ΣW·x·(1−kv)\nMo＝Ma＋Σkh·W·y；xR＝(Mr−Mo)/N；e＝B/2−xR\nFS傾覆＝Mr/Mo；FS滑動＝μN/(Pae＋Kae·q·H＋ΣkhW)\n全接觸 qmax,min＝N/B·(1±6|e|/B)\n部分接觸 b＝3min(xR,B−xR)，qmax＝2N/b\n合力在基底外：失穩，無有效接地壓力。';
const storageKey='retaining-wall-project-v1';
let walls=presets(),current=1,result=null,timer;
function message(s){$('message').textContent=s;}
function tabs(){
  $('tabs').innerHTML=walls.map((w,i)=>`<button type="button" data-index="${i}" class="${i===current?'active':''}" aria-pressed="${i===current}">${esc(w.name.replace('式擋土牆',''))} ${num(w.height+w.base_thickness,1)} m</button>`).join('');
  $('selected-name').textContent=walls[current].name;
}
function form(){
  const w=walls[current];tabs();
  $('form').innerHTML=groups.map(([title,items],i)=>`<details class="input-group" ${i<4?'open':''}><summary>${title}</summary><div class="fields">${items.map(([k,label,type])=>{
    let control;
    if(type==='type'||type==='foundation'){
      const opts=type==='type'?[['cantilever','懸臂式（RC）'],['gravity','重力式']]:[['soil','土層'],['rock','岩盤']];
      control=`<select name="${k}">${opts.map(([v,t])=>`<option value="${v}" ${w[k]===v?'selected':''}>${t}</option>`).join('')}</select>`;
    }else control=`<input name="${k}" type="${type==='text'?'text':'number'}" ${type==='text'?'maxlength="200"':'step="any"'} ${['allowable_bearing','ultimate_bearing','bearing_source'].includes(k)?'':'required'} value="${esc(w[k]??'')}">`;
    return `<label class="${type==='text'||type==='type'?'wide':''}">${label}${control}${type&&!['text','type','foundation'].includes(type)?`<small class="field-hint">${type}</small>`:''}</label>`;
  }).join('')}</div>${title==='地盤承載力'?'<p class="footnote">請填同基底、同載重條件的 gross 值與資料來源。留空時顯示待確認；qa/qmax 不等同承載安全係數。</p>':''}${title==='適用條件'?'<p class="footnote">本版僅接受以上四欄為零。有水、斜坡、凝聚土或粗糙牆背時，請使用支援相應条件的分析方法。</p>':''}</details>`).join('');
}
function read(){
  if(!$('form').checkValidity())throw Error('請填寫有效的必要輸入值。');
  const w={...walls[current]};
  for(const [k,v] of new FormData($('form')))w[k]=['name','wall_type','foundation','bearing_source'].includes(k)?v:v===''?null:Number(v);
  return w;
}
function invalidate(text='輸入已變更，等待重新計算…'){
  result=null;$('overview').textContent=text;$('results').textContent=text;
  $('details').replaceChildren();$('section').replaceChildren();$('geometry').textContent='';
}
function calculate(){
  clearTimeout(timer);
  try{const r=analyze(read());walls[current]=r.input;result=r;render(r);tabs();message('計算已更新。修改後請保存專案，或匯出備份。');return r;}
  catch(e){invalidate(e.message);message('無法計算；請確認參數及適用條件。');return null;}
}
function overview(r){
  const row=(label,c)=>`<div class="overview-row"><span class="overview-title">${label}</span>${badge(c.status)}${c.checks?`<div class="metrics">${[['overturning','傾覆'],['sliding','滑動'],['bearing_fs','承載']].map(([k,t])=>`<span class="metric">${t}<b>${num(c.checks[k].value,2)}</b></span>`).join('')}</div>`:`<span class="footnote">${esc(c.error)}</span>`}</div>`;
  $('overview').innerHTML=row('常時',r.static)+r.seismic.map(c=>row(r.seismic.length>1?`地震 ${c.kv>0?'+':''}${num(c.kv,2)}`:'地震',c)).join('')+`<div class="overview-row"><span class="overview-title">RC</span>${badge('pending')}<span class="footnote">完整設計尚未完成；上述為個別穩定項目。</span></div>`;
}
const caseName=c=>c.case==='static'?'常時':`地震（kv＝${num(c.kv,2)}）`;
function checksTable(c){
  if(c.error)return `<p class="footnote">${esc(c.error)}</p>`;
  return `<table><thead><tr><th>檢核項目</th><th>計算值</th><th>門檻</th><th>結果</th></tr></thead><tbody>${Object.entries(c.checks).map(([k,v])=>`<tr><td>${labels[k]}</td><td>${num(v.value)}</td><td>${['eccentricity','bearing_allowable'].includes(k)?'≤':'≥'} ${num(v.limit)}</td><td>${badge(v.status)}</td></tr>`).join('')}</tbody></table><p class="footnote">接地狀態：${{full:'全底面受壓',partial:'部分接觸',unstable:'合力超出基底／失穩'}[c.pressure.mode]} · 接觸寬 ${num(c.pressure.contact_width)} m · qmin ${num(c.pressure.qmin)} kPa</p>`;
}
function forces(c){
  if(c.error)return '';
  const list=[['主動土壓係數 Ka',c.ka,'—'],['工況土壓係數 Kae',c.kae,'—'],['有效垂直力 N',c.normal,'kN/m'],['土壓合力',c.earth_force,'kN/m'],['地表載重側力',c.surcharge_force,'kN/m'],['自重慣性力',c.inertia_force,'kN/m'],['穩定力矩 Mr',c.resisting_moment,'kN·m/m'],['傾覆力矩 Mo',c.overturning_moment,'kN·m/m'],['合力位置 xR',c.resultant_x,'m'],['偏心距 e',c.eccentricity,'m']];
  return `<table><thead><tr><th>項目</th><th>數值</th><th>單位</th></tr></thead><tbody>${list.map(([t,v,u])=>`<tr><td>${t}</td><td>${num(v)}</td><td>${u}</td></tr>`).join('')}</tbody></table>`;
}
const loadTable=c=>`<table><thead><tr><th>重量項目</th><th>W kN/m</th><th>x m</th><th>y m</th></tr></thead><tbody>${c.loads.map(v=>`<tr><td>${v.name}</td><td>${num(v.weight)}</td><td>${num(v.x)}</td><td>${num(v.y)}</td></tr>`).join('')}</tbody></table>`;
function draw(r){
  const w=r.input,c=r.static,b=c.width,H=c.earth_height,s=Math.min(430/b,270/H),ox=70,oy=330;
  const pts=c.stem_polygon.map(([x,y])=>`${ox+x*s},${oy-y*s}`).join(' '),rear=w.toe+w.stem_bottom;
  $('section').innerHTML=`<defs><pattern id="soil" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M2 5h3 M8 12h3" stroke="#d7bd8e" stroke-width="1"/></pattern></defs><rect x="${ox+rear*s}" y="${oy-H*s}" width="${Math.max(15,(b-rear)*s+35)}" height="${w.height*s}" fill="#f1e8d5"/><rect x="${ox+rear*s}" y="${oy-H*s}" width="${Math.max(15,(b-rear)*s+35)}" height="${w.height*s}" fill="url(#soil)"/><path d="M30 ${oy}H570" stroke="#879c9d"/><rect x="${ox}" y="${oy-w.base_thickness*s}" width="${b*s}" height="${w.base_thickness*s}" fill="#b3c5cf" stroke="#36556b" stroke-width="2"/><polygon points="${pts}" fill="#b3c5cf" stroke="#36556b" stroke-width="2"/><path d="M${ox-20} ${oy-H*s}V${oy}" stroke="#56717c"/><text x="${ox-28}" y="${oy-H*s/2}" font-size="14" text-anchor="end">${num(H,2)} m</text><path d="M${ox} ${oy+24}H${ox+b*s}" stroke="#56717c"/><text x="${ox+b*s/2}" y="${oy+46}" font-size="14" text-anchor="middle">B＝${num(b,2)} m</text><text x="${ox+rear*s+15}" y="${oy-H*s-15}" fill="#806d4a" font-size="14">水平乾燥背填土</text>`;
  $('geometry').textContent=`牆身 ${num(w.height,2)} m ＋ 底版 ${num(w.base_thickness,2)} m。示意斷面，非施工圖。`;
}
function render(r){
  overview(r);draw(r);
  $('results').innerHTML=[r.static,...r.seismic].map(c=>`<div class="case">${caseName(c)} ${badge(c.status)}</div>${checksTable(c)}`).join('')+`<p class="footnote">RC：${esc(r.rc.reason)}。完整設計狀態：未完成。</p>`;
  $('details').innerHTML=`<details class="detail" open><summary>適用範圍與模型假設</summary><ul class="footnote assumptions">${r.assumptions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details><details class="detail"><summary>計算公式</summary><pre>${esc(formula)}</pre></details><details class="detail"><summary>重量與重心</summary>${loadTable(r.static)}</details>${[r.static,...r.seismic].map(c=>`<details class="detail"><summary>${caseName(c)} · 外力及力矩</summary>${c.error?`<p>${esc(c.error)}</p>`:forces(c)}</details>`).join('')}<p class="footnote">門檻參考：<a href="${r.source}" target="_blank" rel="noopener">水土保持技術規範第 120 條</a>（114/05/07 版）。分析模型 v${r.engine_version}。未替代案件適用性審查。</p>`;
}
function makeReport(r){
  const input=groups.map(([title,items])=>`<section class="report-block"><h3>${title}</h3><table><tbody>${items.map(([k,t])=>`<tr><th>${t}</th><td>${esc(k==='wall_type'?r.input[k]==='gravity'?'重力式':'懸臂式':k==='foundation'?r.input[k]==='rock'?'岩盤':'土層':r.input[k]??'未提供')}</td></tr>`).join('')}</tbody></table></section>`).join('');
  $('report-document').innerHTML=`<h2>擋土牆分析計算書</h2><p>${esc($('project').value||'未命名計畫')}<br>${esc(r.input.name)}</p><p class="report-meta">製表時間：${esc(new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))}（台灣時間）<br>每延米牆長；m / kN / kPa。網頁版 0.2 · 分析模型 ${r.engine_version}</p><p><strong>乾土限定分析；RC、沉陷及整體穩定尚未完成，非完整設計合格證明。</strong></p><section class="report-block"><h3>斷面示意</h3><svg viewBox="0 0 600 400" aria-label="計算斷面">${$('section').innerHTML.replaceAll('id="soil"','id="report-soil"').replaceAll('url(#soil)','url(#report-soil)')}</svg></section>${input}${[r.static,...r.seismic].map(c=>`<section class="report-block"><h3>${caseName(c)} ${badge(c.status)}</h3>${checksTable(c)}</section><section class="report-block">${forces(c)}</section>`).join('')}<section class="report-block"><h3>重量與重心</h3>${loadTable(r.static)}</section><section class="report-block"><h3>計算公式</h3><p style="white-space:pre-wrap">${esc(formula)}</p></section><section class="report-block"><h3>模型假設及判定依據</h3><ul class="footnote assumptions">${r.assumptions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="footnote">水土保持技術規範第 120 條（114/05/07 版）<br>${esc(r.source)}<br>承載 FS 門檻 3.0，兩工況均採用；不自動提高 qa。未替代建築物基礎規範之適用性審查。</p></section>`;
}
function validatedProject(){
  const r=calculate();if(!r)throw Error('請先修正目前斷面。');
  for(const w of walls)analyze(w);
  return {schema_version:1,engine_version:r.engine_version,project_name:$('project').value,walls,current};
}
function restore(p){
  if(!p||p.schema_version!==1||!Array.isArray(p.walls)||!p.walls.length||p.walls.length>100||typeof p.project_name!=='string'||p.project_name.length>200)throw Error('不支援的專案格式；最多 100 斷面。');
  const next=p.walls.map(w=>analyze(w).input);
  walls=next;current=Number.isInteger(p.current)&&p.current>=0&&p.current<walls.length?p.current:0;
  $('project').value=p.project_name;form();calculate();
}
function download(p){
  const url=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='retaining-wall-project.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('form').addEventListener('submit',e=>e.preventDefault());
$('form').addEventListener('input',()=>{invalidate();clearTimeout(timer);timer=setTimeout(calculate,300);});
$('tabs').onclick=e=>{
  const b=e.target.closest('button[data-index]');if(!b)return;
  if(!calculate())return;current=Number(b.dataset.index);form();calculate();
};
$('add').onclick=()=>{if(!calculate())return;if(walls.length>=100){message('最多建立 100 道擋土牆。');return;}walls.push({...walls[current],name:`新增擋土牆 ${walls.length+1}`});current=walls.length-1;form();calculate();};
$('save').onclick=()=>{try{localStorage.setItem(storageKey,JSON.stringify(validatedProject()));message('已保存至此瀏覽器；重新開啟後會還原。');}catch(e){message('保存失敗：'+e.message);}};
$('export').onclick=()=>{try{download(validatedProject());message('已匯出專案 JSON。');}catch(e){message('匯出失敗：'+e.message);}};
$('import-button').onclick=()=>$('import').click();
$('import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1e6)throw Error('檔案不可超過 1 MB');restore(JSON.parse(await file.text()));message('已匯入。請按保存專案以保留修改。');}catch(err){message('匯入失敗：'+err.message);}finally{e.target.value='';}};
$('copy').onclick=async()=>{
  const r=calculate();if(!r)return;
  const text=[`${$('project').value||'未命名計畫'}／${r.input.name}`,...[r.static,...r.seismic].map(c=>`${caseName(c)}：${names[c.status]}\n${c.error||Object.entries(c.checks).map(([k,v])=>`${labels[k]} ${num(v.value)}（${names[v.status]}）`).join('；')}`),'RC 未檢核；完整設計未完成。',...r.assumptions].join('\n\n');
  try{await navigator.clipboard.writeText(text);message('已複製計算摘要與適用條件。');}catch{message('此瀏覽器無法寫入剪貼簿，請使用成果報告書或匯出。');}
};
$('report').onclick=()=>{const r=calculate();if(!r)return;makeReport(r);$('workspace').hidden=true;$('report-panel').hidden=false;window.scrollTo({top:0,behavior:'smooth'});};
$('back').onclick=()=>{$('report-panel').hidden=true;$('workspace').hidden=false;};
$('print').onclick=()=>window.print();
$('scope-link').onclick=()=>$('scope').scrollIntoView({behavior:'smooth'});
window.addEventListener('beforeprint',()=>{if(!$('report-panel').hidden)return;const r=calculate();if(r)makeReport(r);else $('report-document').textContent='輸入無效，沒有可列印的計算結果。';});
form();calculate();
try{const saved=localStorage.getItem(storageKey);if(saved){restore(JSON.parse(saved));message('已還原上次保存的專案。');}}catch(e){message('保存資料無法還原，已載入示範斷面：'+e.message);}
