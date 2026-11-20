const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[ch]);
const json = async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error('無法讀取 ' + path);
  return response.json();
};
const base = './evidence/gemini/';
const states = ['待確認','進行中','已完成'];
const labels = {department:'部門',owner:'負責人',title:'任務名稱',output:'預期產出',problem:'原始問題',steps:'建議處理步驟',confirm:'需要人工確認的項目',missing:'尚缺少的資訊'};
const required = ['department','title','problem','output','owner'];
const lists = ['steps','confirm','missing'];
const pages = {review:'草稿審閱',tasks:'任務追蹤',records:'實測紀錄'};
const descriptions = {review:'核對原始需求與 Gemini 草稿，補齊欄位後加入任務清單。',tasks:'追蹤已確認的工作，依部門與狀態篩選並匯出目前清單。',records:'查閱這次模型執行的原始證據與瀏覽器驗收結果。'};
const paths = [
  'M4 5h6l2 2h8v12H4z M7 12h10 M7 15h6',
  'M7 3h8l4 4v14H5V3z M14 3v5h5 M8 12h7 M8 16h5',
  'M12 3a9 9 0 1 0 9 9 M12 6v6l4 2 M17 4l2 2',
  'M20 11a8 8 0 1 1-4-6 M8 11l3 3 8-9'
];
const icon = i => '<svg aria-hidden="true" class="icon" viewBox="0 0 24 24"><path d="'+paths[i]+'"/></svg>';
const count = n => String(n).padStart(2,'0');
const tag = (s,style='') => '<span class="badge '+style+'">'+esc(s)+'</span>';
const option = (s,selected) => '<option '+(s===selected?'selected':'')+'>'+esc(s)+'</option>';
const localTime = iso => new Date(iso).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
let inputs, original, meta, raw, runPath, storageKey;
let edits = {}, selected = 'A', dept = '', status = '', recordTab = '執行摘要', timer;
const page = () => Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'review';
const row = id => ({...original.find(d=>d.id===id), ...edits[id]});
const rows = () => inputs.map(d=>row(d.id));
const tasks = () => rows().filter(d=>d.confirmed);
const visible = () => tasks().filter(d=>(!dept || d.department===dept) && (!status || d.status===status));
const gaps = d => required.filter(k=>!d[k]?.trim());
function signal(text) {
  $('#toast').textContent=text;
  clearTimeout(timer);
  timer=setTimeout(()=>$('#toast').textContent='',2800);
}
function readEdits() {
  const parsed=JSON.parse(localStorage.getItem(storageKey)||'{}');
  if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('本機資料格式異常');
  return parsed;
}
function persist(id, patch) {
  try {
    const next=readEdits();
    next[id]={...next[id], ...patch};
    localStorage.setItem(storageKey,JSON.stringify(next));
    edits=next;
    return true;
  } catch {
    signal('無法儲存，請檢查瀏覽器的本機儲存權限。');
    return false;
  }
}
function stats() {
  const all=rows(), saved=tasks();
  const items=[['需求總數',all.length,''],['待審草稿',all.length-saved.length,'amber'],['進行中任務',saved.filter(d=>d.status===states[1]).length,'teal'],['已完成任務',saved.filter(d=>d.status===states[2]).length,'violet']];
  $('#stats').innerHTML=items.map(([name,n,color],i)=>'<div class="stat"><span class="glyph '+color+'">'+icon(i)+'</span><div><small>'+name+'</small><strong>'+count(n)+'</strong></div></div>').join('');
}
function caseBadge(d) {
  if(d.confirmed) return tag(d.status,'blue');
  return gaps(d).length ? tag('待補資料','warn') : tag('待審閱');
}
function queue() {
  return rows().map(d=>'<button class="case '+(d.id===selected?'active':'')+'" data-case="'+esc(d.id)+'" aria-pressed="'+(d.id===selected)+'"><span class="rowline"><span class="serial">REQ / '+esc(d.id)+'</span>'+caseBadge(d)+'</span><strong>'+esc(d.title||'未命名需求')+'</strong><span class="meta">'+esc(d.department||'待補部門')+' · '+esc(d.owner||'負責人待補')+'</span></button>').join('');
}
function field(key,d) {
  const multi=lists.includes(key)||key==='problem';
  const value=lists.includes(key)?d[key].join('\n'):d[key];
  const attrs=' data-field="'+key+'" id="field-'+key+'" '+(required.includes(key)?'required ':'')+(gaps(d).includes(key)?'aria-invalid="true"':'');
  return '<label><span class="'+(required.includes(key)?'required':'')+'">'+labels[key]+'</span>'+ (multi ? '<textarea rows="'+(lists.includes(key)?3:2)+'"'+attrs+'>'+esc(value)+'</textarea>' : '<input '+attrs+' value="'+esc(value)+'" placeholder="請填寫'+labels[key]+'">')+'</label>';
}
function review() {
  const d=row(selected), input=inputs.find(x=>x.id===selected);
  const core=['department','owner','title','output'];
  $('#workspace').innerHTML='<div class="layout"><aside class="panel"><div class="panel-head"><h2>需求收件匣</h2><span class="count">'+count(inputs.length)+'</span></div><div class="queue">'+queue()+'</div><div class="queue-note">依原始案例順序排列</div></aside><section class="panel detail"><div class="rowline"><span class="serial">REQ / '+esc(d.id)+'</span>'+tag('Gemini 實測結果')+'</div><h2 id="review-title">'+esc(d.title||'未命名需求')+'</h2><div class="source"><b>'+esc(input.department)+' · 原始需求</b><p>'+esc(input.request)+'</p></div><form id="edit"><div class="formgrid">'+core.map(k=>field(k,d)).join('')+'</div><details><summary>問題、建議步驟與待確認事項</summary><p class="muted">清單每行一項。請核對模型的推論，並更新已補齊的項目。</p><div class="formgrid">'+['problem',...lists].map(k=>field(k,d)).join('')+'</div></details><div class="actionbar"><p id="hint" class="hint" role="status"></p><button id="confirm" class="primary">'+(d.confirmed?'儲存任務修改':'確認並加入任務')+'</button></div></form></section></div>';
  updateHint(d);
  $('#edit').addEventListener('input',e=>{
    const key=e.target.dataset.field;
    if(!key) return;
    const value=lists.includes(key)?e.target.value.split('\n').map(s=>s.trim()).filter(Boolean):e.target.value;
    // 已入列任務須在按下儲存時一次驗證，避免中途清空欄位破壞任務。
    if(!d.confirmed && !persist(d.id,{[key]:value})) return;
    d[key]=value;
    e.target.setAttribute('aria-invalid',gaps(d).includes(key));
    updateHint(d);
    $('.queue').innerHTML=queue();
  });
  $('#edit').onsubmit=e=>{
    e.preventDefault();
    if(gaps(d).length) return;
    const patch=Object.fromEntries(Object.keys(labels).map(k=>[k,d[k]]));
    if(!persist(d.id,{...patch,confirmed:true,status:row(d.id).status||states[0]})) return;
    dept='';status='';location.hash='tasks';
    signal('任務已儲存');
  };
}
function updateHint(d) {
  const missing=gaps(d);
  $('#confirm').disabled=!!missing.length;
  $('#hint').classList.toggle('ok',!missing.length);
  $('#hint').textContent=missing.length?'待補必填欄位：'+missing.map(k=>labels[k]).join('、'):(d.confirmed?'修改後請儲存任務。':'必填欄位齊全，可確認送出。');
}
function taskView() {
  const all=tasks(), filtered=visible(), departments=[...new Set(all.map(d=>d.department))];
  $('#workspace').innerHTML='<section class="panel"><div class="panel-head"><div class="rowline"><h2>任務清單</h2><span class="count">'+filtered.length+' / '+all.length+'</span></div><button class="button alt" id="export">匯出 JSON</button></div><div class="filters"><label>部門 <select id="dept"><option value="">全部部門</option>'+departments.map(s=>option(s,dept)).join('')+'</select></label><label>狀態 <select id="status"><option value="">全部狀態</option>'+states.map(s=>option(s,status)).join('')+'</select></label></div><div class="tablewrap"><table><thead><tr><th>案件</th><th>任務名稱</th><th>部門</th><th>負責人</th><th>狀態</th></tr></thead><tbody>'+filtered.map(d=>'<tr data-id="'+esc(d.id)+'"><td class="serial">REQ / '+esc(d.id)+'</td><td><a class="link" data-edit="'+esc(d.id)+'" href="#review">'+esc(d.title)+'</a></td><td>'+esc(d.department)+'</td><td>'+esc(d.owner)+'</td><td><select aria-label="案件 '+esc(d.id)+' 狀態" data-state="'+esc(d.id)+'">'+states.map(s=>option(s,d.status)).join('')+'</select></td></tr>').join('')+'</tbody></table></div>'+(!filtered.length?'<div class="empty">'+(all.length?'此篩選條件沒有任務。':'尚無已確認任務。請先至草稿審閱補齊欄位。')+'</div>':'')+'</section>';
  $('#dept').onchange=e=>{dept=e.target.value;taskView()};
  $('#status').onchange=e=>{status=e.target.value;taskView()};
  $('#export').onclick=()=>{
    const exportRows=visible().map(d=>({...d,sourceRequest:inputs.find(x=>x.id===d.id).request,modelRun:meta.responseId}));
    const url=URL.createObjectURL(new Blob([JSON.stringify(exportRows,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='部門任務清單.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);signal('已匯出 '+exportRows.length+' 筆任務');
  };
}
const recordTabs=['執行摘要','輸入與原始輸出','瀏覽器驗收'];
function records() {
  let content='';
  if(recordTab===recordTabs[0]){
    const facts=[['執行結果',meta.status],['模型版本',meta.modelVersion],['回應時間',meta.elapsedSeconds+' 秒'],['執行時間（臺北）',localTime(meta.startedAt)],['處理案例',meta.caseCount+' 筆'],['API 回應','HTTP '+meta.httpStatus]];
    content='<div class="facts">'+facts.map(([k,v])=>'<div><small>'+k+'</small><b>'+esc(v)+'</b></div>').join('')+'</div><div class="filelinks">'+[['request','請求本文'],['response','原始回應'],['parsed','解析草稿'],['execution','執行紀錄']].map(([f,n])=>'<a href="'+runPath+f+'.json" target="_blank" rel="noopener">'+n+' JSON</a>').join('')+'</div><small>回應識別碼　'+esc(meta.responseId)+'　·　'+esc(meta.projectTier)+'</small>';
  }else if(recordTab===recordTabs[1]){
    const text=raw.candidates[0].content.parts.filter(p=>!p.thought).map(p=>p.text||'').join('');
    content='<div class="record-grid"><div><h3>原始需求</h3>'+inputs.map(i=>'<div class="source"><b>REQ / '+i.id+' · '+esc(i.department)+'</b><p>'+esc(i.request)+'</p></div>').join('')+'</div><div><h3>Gemini 原始輸出</h3><pre>'+esc(text)+'</pre><a class="link" href="'+runPath+'response.json">完整 API 回應 JSON</a></div></div>';
  }else{
    content='<div id="test-results" aria-live="polite">讀取驗收紀錄中…</div>';
  }
  $('#workspace').innerHTML='<section class="panel"><div class="panel-head"><h2>實測紀錄</h2>'+tag('合成示範資料')+'</div><div class="record-tabs">'+recordTabs.map(s=>'<button data-record="'+s+'" class="'+(recordTab===s?'active':'')+'">'+s+'</button>').join('')+'</div><div class="records-body">'+content+'</div></section>';
  if(recordTab===recordTabs[2]) loadTests();
}
async function loadTests(){
  const node=$('#test-results');
  try{
    const result=await json('./evidence/browser.json');
    node.innerHTML='<div class="rowline"><h3>'+esc(result.environment)+'驗收</h3>'+tag(result.checks.filter(x=>x.passed).length+' / '+result.checks.length+' 通過')+'</div><p class="muted">'+esc(localTime(result.finishedAt))+'（臺北） · '+esc(result.browser)+'</p><table><tbody>'+result.checks.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc(c.detail)+'</td><td>'+tag(c.passed?'通過':'失敗',c.passed?'':'warn')+'</td></tr>').join('')+'</tbody></table><div class="filelinks"><a href="./evidence/browser.json">查看測試原始紀錄</a></div>';
  }catch{node.textContent='目前沒有可讀取的瀏覽器驗收紀錄。'}
}
function render(){
  const p=page();$('#crumb').textContent=pages[p];$('#lead').textContent=descriptions[p];
  document.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+p)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  stats();({review,tasks:taskView,records})[p]();$('#workspace').setAttribute('aria-busy','false');
}
$('#workspace').onclick=e=>{
  const el=e.target.closest('[data-case],[data-record],[data-edit]');if(!el)return;
  if(el.dataset.case){selected=el.dataset.case;review()}
  if(el.dataset.record){recordTab=el.dataset.record;records()}
  if(el.dataset.edit)selected=el.dataset.edit;
};
$('#workspace').onchange=e=>{
  if(e.target.dataset.state){
    if(persist(e.target.dataset.state,{status:e.target.value}))signal('已更新狀態');
    render();
  }
};
try{
  const verified=await json(base+'verified.json');
  runPath=base+verified.run+'/';
  [inputs,original,meta,raw]=await Promise.all([json(base+'inputs.json'),...['parsed','execution','response'].map(n=>json(runPath+n+'.json'))]);
  storageKey='ai-request-workbench:v1:'+meta.responseId;
  edits=readEdits();render();
  window.addEventListener('hashchange',render);
  window.addEventListener('storage',e=>{if(e.key===storageKey){edits=readEdits();render()}});
}catch(error){$('#workspace').textContent='工作台載入失敗，請確認實測檔案及瀏覽器儲存權限。'+error.message}
