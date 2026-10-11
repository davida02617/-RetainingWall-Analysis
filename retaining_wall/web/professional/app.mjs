import {analyze,presets} from './engine.mjs';
import {MODEL} from './model-data.mjs';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=3)=>v==null?'—':Number(v).toFixed(n);
const names={pass:'符合本項',fail:'不符合',pending:'待確認',unsupported:'無法計算'};
const badge=s=>`<span class="badge ${s}">${names[s]||esc(s)}</span>`;
const options={type:[['cantilever','懸臂式（RC）'],['gravity','重力式']],foundation:[['soil','土層'],['rock','岩盤']],regulation:Object.entries(MODEL.profiles),movement:Object.entries(MODEL.movements)};
const groups=[
  ['案件與法規依據', [['name','斷面名稱','text'],['regulation','適用法規','regulation'],['design_basis','案件類別／核定或適用依據','text']]],
  ['斷面尺寸', [['wall_type','牆型','type'],['height','牆身高 m','自底版頂至牆頂'],['base_thickness','底版厚 m'],['toe','牆趾長 m'],['heel','後踵長 m'],['stem_top','牆頂厚 m'],['stem_bottom','牆底厚 m'],['exposed_height','有效露出高度 m','自牆前地面至牆頂；水保 §118']]],
  ['土壤與荷載', [['gamma_soil','土壤單位重 kN/m³'],['gamma_concrete','混凝土單位重 kN/m³'],['phi','土壤摩擦角 °'],['friction','基底摩擦係數 μ'],['foundation','基礎種類','foundation'],['soil_source','地勘／試驗／摩擦參數來源','text'],['surcharge','均佈載重 q kPa'],['load_source','載重種類與組合依據','text']]],
  ['地震與位移模式', [['kh','水平地震係數 kh'],['kv','垂直地震係數 |kv|','分析 ±|kv|；正值降低有效重力'],['movement','牆體位移模式','movement'],['seismic_source','工址／設計地震／kh、kv 依據','text']]],
  ['地盤承載力', [['allowable_bearing','常時 gross qa kPa'],['ultimate_bearing','常時 gross qult kPa'],['allowable_bearing_seismic','地震 gross qa kPa','留空沿用常時值'],['ultimate_bearing_seismic','地震 gross qult kPa','留空沿用常時值'],['overburden_pressure','開挖前覆土壓力 q0 kPa','建築淨承載 FS 必填；地表基礎可填 0'],['bearing_source','承載力報告／頁碼／工況／修正方法','text']]],
  ['適用條件', [['groundwater_height','地下水高 m'],['backfill_slope','背填坡度 °'],['cohesion','凝聚力 kPa'],['wall_friction','牆背摩擦角 °'],['model_source','乾土、排水調查及主動位移條件依據','text']]]
];
const labels={overturning:'傾覆 FS',sliding:'滑動 FS',eccentricity:'偏心距 |e| (m)',bearing_allowable:'最大壓力 qmax (kPa)',bearing_fs:'承載 FS（依所選基準）'};
const formula='Ka＝tan²(45°−φ/2)\nθ＝atan[kh/(1−kv)]（本程式 θ 為地震慣性角）\nKae＝cos²(φ−θ) / {cos²θ·[1+√(sinφ·sin(φ−θ)/cosθ)]²}\nPa＝0.5·Ka·γ·H²；Pae＝0.5·Kae·γ·H²·(1−kv)\nPq＝Kae·q·H·(1−kv)；ΔP＝Pae−Pa\n常時土壓作用點 H/3。地震按位移模式：\n對牆底旋轉：Ma＝Pa·H/3＋ΔP·2H/3＋Pq·H/2\n滑移：Ma＝Pa·0.42H＋ΔP·0.48H＋Pq·H/2\n對牆頂旋轉：Ma＝Pae·0.55H＋Pq·H/2\nN＝ΣW·(1−kv)；Mr＝ΣW·x·(1−kv)\nMo＝Ma＋Σkh·W·y；xR＝(Mr−Mo)/N；e＝B/2−xR\nFS傾覆＝Mr/Mo；FS滑動＝μN/(Pae＋Pq＋ΣkhW)\n全接觸 qmax,min＝N/B·(1±6|e|/B)\n部分接觸 b＝3min(xR,B−xR)，qmax＝2N/b\n建築承載 FS＝(qult−q0)/(qmax−q0)，分母須＞0\n水保另比較 gross FS＝qult/qmax；同時適用取較不利值\nqa 為地勘 gross 容許值，獨立檢核 qmax≤qa，不自動放大。';
const allCases=r=>[r.static,...r.seismic,...r.additional_cases];
const optional=new Set(['exposed_height','allowable_bearing','ultimate_bearing','allowable_bearing_seismic','ultimate_bearing_seismic','overburden_pressure']);
const formatInput=(k,v)=>Object.hasOwn(options,k==='wall_type'?'type':k)?(options[k==='wall_type'?'type':k].find(([key])=>key===v)?.[1]??v):v??'未提供';
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
    if(options[type]){
      control=`<select name="${k}">${options[type].map(([v,t])=>`<option value="${v}" ${w[k]===v?'selected':''}>${t}</option>`).join('')}</select>`;
    }else control=`<input name="${k}" type="${type==='text'?'text':'number'}" ${type==='text'?'maxlength="200"':'step="any"'} ${optional.has(k)||type==='text'&&k!=='name'?'':'required'} value="${esc(w[k]??'')}">`;
    return `<label class="${type==='text'||options[type]?'wide':''}">${label}${control}${type&&!options[type]&&type!=='text'?`<small class="field-hint">${type}</small>`:''}</label>`;
  }).join('')}</div>${title==='地盤承載力'?'<p class="footnote">qa 須含沉陷限制；qult 須考慮偏心、傾斜與形狀修正。建築規範採淨值 FS；不以 qa/qmax 當安全係數。來源留空會顯示待確認。</p>':''}${title==='適用條件'?'<p class="footnote">本版僅接受以上四欄為零。有水、斜坡、凝聚土或粗糙牆背時，請使用支援相應條件的分析方法。</p>':''}</details>`).join('');
}
function read(){
  if(!$('form').checkValidity())throw Error('請填寫有效的必要輸入值。');
  const w={...walls[current]};
  for(const [k,v] of new FormData($('form')))w[k]=typeof MODEL.defaults[k]==='string'?v:v===''?null:Number(v);
  return w;
}
function invalidate(text='輸入已變更，等待重新計算…'){
  result=null;$('overview').textContent=text;$('results').textContent=text;
  $('details').replaceChildren();$('regulation-summary').replaceChildren();$('review-list').replaceChildren();$('section').replaceChildren();$('geometry').textContent='';
}
function calculate(){
  clearTimeout(timer);
  try{const r=analyze(read());walls[current]=r.input;result=r;render(r);tabs();message('計算已更新。修改後請保存專案，或匯出備份。');return r;}
  catch(e){invalidate(e.message);message('無法計算；請確認參數及適用條件。');return null;}
}
const caseName=c=>(c.case==='static'?'常時':`地震 kv＝${num(c.kv,2)}`)+' · '+MODEL.load_cases[c.loading];
function overview(r){
  const cases=allCases(r), unresolved=cases.some(c=>['pending','unsupported'].includes(c.status));
  $('overview').innerHTML=Object.entries(r.envelope).map(([key,v])=>{
    const c=cases.find(c=>c.id===v.case_id);
    return `<div class="envelope-item"><span class="footnote">${labels[key]}</span><strong>${num(v.value,key==='eccentricity'?3:2)}</strong>${badge(v.status)}<small>${c?esc(caseName(c)):'尚無有效工況'}</small></div>`;
  }).join('');
  $('regulation-summary').innerHTML=`<div><span class="eyebrow">DESIGN BASIS · ${r.regulation.review_date}</span><h2>${esc(r.regulation.name)}</h2><p>${esc(r.input.design_basis||'請選擇案件適用法規並填寫依據；示範斷面尚未確認適用性。')}</p></div><div class="review-state">完整設計：未完成<br><small>${cases.length} 組分析工況${unresolved?' · 含待確認／無法計算工況':''}</small></div>`;
}
function checksTable(c){
  if(c.error)return `<p class="footnote">${esc(c.error)}</p>`;
  return `<table><thead><tr><th>檢核項目</th><th>計算值</th><th>門檻</th><th>結果</th></tr></thead><tbody>${Object.entries(c.checks).map(([k,v])=>`<tr><td>${labels[k]}<small class="basis">${esc(v.basis)}</small></td><td>${num(v.value)}</td><td>${v.operator} ${num(v.limit)}</td><td>${badge(v.status)}</td></tr>`).join('')}</tbody></table><p class="footnote">接地狀態：${{full:'全底面受壓',partial:'部分接觸',unstable:'合力超出基底／失穩'}[c.pressure.mode]} · 接觸寬 ${num(c.pressure.contact_width)} m · qmin ${num(c.pressure.qmin)} kPa</p>${c.missing.length?`<p class="review-warning">待補依據：${c.missing.map(esc).join("、")}。數值符合不代表案件條件已確認。</p>`:""}`;
}
function forces(c){
  if(c.error)return '';
  const list=[['主動土壓係數 Ka',c.ka,'—'],['工況土壓係數 Kae',c.kae,'—'],['有效垂直力 N',c.normal,'kN/m'],['土壓作用高度',c.earth_application_height,'m'],['採用 gross qa',c.bearing.qa,'kPa'],['採用 gross qult',c.bearing.qult,'kPa'],['開挖前覆土壓力 q0',c.bearing.q0,'kPa'],['gross 承載 FS',c.bearing.fs_gross,'—'],['net 承載 FS',c.bearing.fs_net,'—'],['土壓合力',c.earth_force,'kN/m'],['地表載重側力',c.surcharge_force,'kN/m'],['自重慣性力',c.inertia_force,'kN/m'],['穩定力矩 Mr',c.resisting_moment,'kN·m/m'],['傾覆力矩 Mo',c.overturning_moment,'kN·m/m'],['合力位置 xR',c.resultant_x,'m'],['偏心距 e',c.eccentricity,'m']];
  return `<table><thead><tr><th>項目</th><th>數值</th><th>單位</th></tr></thead><tbody>${list.map(([t,v,u])=>`<tr><td>${t}</td><td>${num(v)}</td><td>${u}</td></tr>`).join('')}</tbody></table>`;
}
const loadTable=c=>`<table><thead><tr><th>重量項目</th><th>W kN/m</th><th>x m</th><th>y m</th></tr></thead><tbody>${c.loads.map(v=>`<tr><td>${v.name}</td><td>${num(v.weight)}</td><td>${num(v.x)}</td><td>${num(v.y)}</td></tr>`).join('')}</tbody></table>`;
function draw(r){
  const w=r.input,c=r.static,b=c.width,H=c.earth_height,s=Math.min(430/b,270/H),ox=70,oy=330;
  const pts=c.stem_polygon.map(([x,y])=>`${ox+x*s},${oy-y*s}`).join(' '),rear=w.toe+w.stem_bottom;
  $('section').innerHTML=`<defs><pattern id="soil" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M2 5h3 M8 12h3" stroke="#d7bd8e" stroke-width="1"/></pattern></defs><rect x="${ox+rear*s}" y="${oy-H*s}" width="${Math.max(15,(b-rear)*s+35)}" height="${w.height*s}" fill="#f1e8d5"/><rect x="${ox+rear*s}" y="${oy-H*s}" width="${Math.max(15,(b-rear)*s+35)}" height="${w.height*s}" fill="url(#soil)"/><path d="M30 ${oy}H570" stroke="#879c9d"/><rect x="${ox}" y="${oy-w.base_thickness*s}" width="${b*s}" height="${w.base_thickness*s}" fill="#b3c5cf" stroke="#36556b" stroke-width="2"/><polygon points="${pts}" fill="#b3c5cf" stroke="#36556b" stroke-width="2"/><path d="M${ox-20} ${oy-H*s}V${oy}" stroke="#56717c"/><text x="${ox-28}" y="${oy-H*s/2}" font-size="14" text-anchor="end">${num(H,2)} m</text><path d="M${ox} ${oy+24}H${ox+b*s}" stroke="#56717c"/><text x="${ox+b*s/2}" y="${oy+46}" font-size="14" text-anchor="middle">B＝${num(b,2)} m</text><text x="${ox+rear*s+15}" y="${oy-H*s-15}" fill="#806d4a" font-size="14">水平乾燥背填土</text>`;
  $('geometry').textContent=`牆身 ${num(w.height,2)} m ＋ 底版 ${num(w.base_thickness,2)} m。示意斷面，非施工圖。`;
}
function referenceList(r){return `<ul class="reference-list">${r.references.map(v=>`<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a><small>${esc(v.edition)} · ${esc(v.clauses)}${v.pdf?` · <a href="${esc(v.pdf)}" target="_blank" rel="noopener">112 年版全文 PDF</a>`:''}</small></li>`).join('')}</ul>`;}
function reviewList(r){return `<p class="footnote">以下工作尚未完成；本程式不提供整體合格或可施工判定。</p><div class="review-grid">${r.outstanding.map(v=>`<div><h3>${esc(v.item)} ${badge(v.status)}</h3><p>${esc(v.detail)}</p><small>${esc(v.basis)}</small></div>`).join('')}</div><p class="footnote">有效露出高度：${num(r.height_review.value)} m ${badge(r.height_review.status)} · ${esc(r.height_review.reason)}${r.height_review.limit!==null?`原則上限 ${r.height_review.limit} m。`:''}</p>`;}
function render(r){
  overview(r);draw(r);
  $('results').innerHTML=allCases(r).map((c,i)=>`<details class="detail" ${i<2?'open':''}><summary>${esc(caseName(c))} ${badge(c.status)}</summary>${checksTable(c)}</details>`).join('');
  $('review-list').innerHTML=reviewList(r);
  $('details').innerHTML=`<details class="detail" open><summary>適用範圍與模型假設</summary><ul class="footnote assumptions">${r.assumptions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details><details class="detail"><summary>計算公式</summary><pre>${esc(formula)}</pre></details>${allCases(r).map(c=>`<details class="detail"><summary>${esc(caseName(c))} · 外力及力矩</summary>${c.error?`<p>${esc(c.error)}</p>`:forces(c)+loadTable(c)}</details>`).join('')}<h3>官方依據與版次</h3>${referenceList(r)}<p class="footnote">條文查核日 ${r.regulation.review_date} · 分析模型 v${r.engine_version}。門檻以未四捨五入數值比較；建築「＞」與水保「≥」分開處理。控制工況依相對門檻最不利值選取；有缺漏或無解時不得視為通過。</p>`;
}
function makeReport(r){
  const input=groups.map(([title,items])=>`<section class="report-block"><h3>${title}</h3><table><tbody>${items.map(([k,t])=>`<tr><th>${t}</th><td>${esc(formatInput(k,r.input[k])||'未提供')}</td></tr>`).join('')}</tbody></table></section>`).join('');
  $('report-document').innerHTML=`<span class="eyebrow">RETAINING WALL · DESIGN REVIEW</span><h2>擋土牆外部穩定分析計算書</h2><p>${esc($('project').value||'未命名計畫')}<br>${esc(r.input.name)}</p><p class="report-meta">製表：${esc(new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))}（台灣時間）<br>模型 ${r.engine_version} · 每延米；m / kN / kPa。法規查核日 ${r.regulation.review_date}<br>適用依據：${esc(r.regulation.name)}</p><p class="review-warning"><strong>完整設計未完成。本書為所列模型與工況的分析紀錄，不是施工核定或完整設計合格證明。</strong></p><section class="report-block"><h3>斷面示意</h3><svg viewBox="0 0 600 400" aria-label="計算斷面">${$('section').innerHTML.replaceAll('id="soil"','id="report-soil"').replaceAll('url(#soil)','url(#report-soil)')}</svg></section>${input}<section class="report-block"><h3>控制工況包絡</h3><p class="footnote">各項依相對門檻選取最不利工況；完整工況見下表。</p><table><thead><tr><th>項目</th><th>值</th><th>控制工況</th><th>結果</th></tr></thead><tbody>${Object.entries(r.envelope).map(([k,v])=>`<tr><td>${labels[k]}</td><td>${num(v.value)}</td><td>${esc(allCases(r).find(c=>c.id===v.case_id)?caseName(allCases(r).find(c=>c.id===v.case_id)):'無有效工況')}</td><td>${badge(v.status)}</td></tr>`).join('')}</tbody></table></section>${allCases(r).map(c=>`<section class="report-block"><h3>${esc(caseName(c))} ${badge(c.status)}</h3>${checksTable(c)}</section>${c.error?'':`<section class="report-block">${forces(c)}${loadTable(c)}</section>`}`).join('')}<section class="report-block"><h3>設計待辦與限制</h3>${reviewList(r)}</section><section class="report-block"><h3>計算公式</h3><p style="white-space:pre-wrap">${esc(formula)}</p></section><section class="report-block"><h3>模型假設</h3><ul class="footnote assumptions">${r.assumptions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section class="report-block"><h3>官方法規依據</h3>${referenceList(r)}</section>`;
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
  const text=[`${$('project').value||'未命名計畫'}／${r.input.name}`,...allCases(r).map(c=>`${caseName(c)}：${names[c.status]}\n${c.error||Object.entries(c.checks).map(([k,v])=>`${labels[k]} ${num(v.value)}（${names[v.status]}）`).join('；')}`),`法規：${r.regulation.name}；模型 ${r.engine_version}`,'RC、沉陷、整體穩定、液化與排水未檢核；完整設計未完成。',...r.assumptions].join('\n\n');
  try{await navigator.clipboard.writeText(text);message('已複製計算摘要與適用條件。');}catch{message('此瀏覽器無法寫入剪貼簿，請使用成果報告書或匯出。');}
};
$('report').onclick=()=>{const r=calculate();if(!r)return;makeReport(r);$('workspace').hidden=true;$('report-panel').hidden=false;window.scrollTo({top:0,behavior:'smooth'});};
$('back').onclick=()=>{$('report-panel').hidden=true;$('workspace').hidden=false;};
$('print').onclick=()=>window.print();
$('scope-link').onclick=()=>$('scope').scrollIntoView({behavior:'smooth'});
window.addEventListener('beforeprint',()=>{if(!$('report-panel').hidden)return;const r=calculate();if(r)makeReport(r);else $('report-document').textContent='輸入無效，沒有可列印的計算結果。';});
form();calculate();
try{const saved=localStorage.getItem(storageKey);if(saved){restore(JSON.parse(saved));message('已還原上次保存的專案。');}}catch(e){message('保存資料無法還原，已載入示範斷面：'+e.message);}
