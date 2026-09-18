export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ntfy MCP 管理</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}html{background:#f5f7fb}body{margin:0;min-width:320px;background:#f5f7fb}button,input,select{font:inherit}.app{min-height:100vh;display:grid;grid-template-columns:244px minmax(0,1fr)}.sidebar{position:sticky;top:0;height:100vh;background:#101827;color:#dbe3ef;padding:20px 14px;display:flex;flex-direction:column;border-right:1px solid #1f2a3b}.brand{padding:4px 8px 20px;border-bottom:1px solid rgba(255,255,255,.08)}.brand-title{font-size:17px;font-weight:750;color:#fff;letter-spacing:-.01em}.brand-sub{margin-top:5px;color:#8fa0b7;font-size:12px;line-height:1.5}.nav{display:flex;flex-direction:column;gap:6px;padding:16px 0}.nav-item{width:100%;display:flex;align-items:center;gap:10px;border:0;background:transparent;color:#b9c5d6;border-radius:9px;padding:10px 11px;text-align:left;cursor:pointer;font-size:14px;font-weight:600}.nav-item:hover{background:rgba(255,255,255,.06);color:#fff}.nav-item.active{background:#24344d;color:#fff}.nav-icon{width:22px;height:22px;border-radius:6px;display:inline-grid;place-items:center;background:rgba(255,255,255,.06);font-size:12px;flex:0 0 auto}.nav-item.active .nav-icon{background:rgba(255,255,255,.12)}.sidebar-foot{margin-top:auto;padding:14px 8px 4px;border-top:1px solid rgba(255,255,255,.08)}.sidebar-foot .muted{color:#8fa0b7}.sidebar-url{margin-top:6px;color:#cbd5e1;font-size:11px;line-height:1.45;word-break:break-all}.main{min-width:0}.main-inner{max-width:1260px;margin:0 auto;padding:26px 30px 42px}.mobilebar{display:none}.view{display:none}.view.active{display:block}.section-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.section-head h1{font-size:27px;line-height:1.18;margin:0 0 6px;letter-spacing:-.02em}.muted{color:#687386;font-size:13px}.badge{display:inline-flex;align-items:center;border:1px solid #d7deea;background:#fff;border-radius:999px;padding:7px 11px;font-size:12px;color:#526075}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 14px}.card{background:#fff;border:1px solid #e2e7f0;border-radius:14px;box-shadow:0 5px 18px rgba(30,45,70,.05)}.metric{padding:16px}.metric strong{display:block;font-size:24px;margin-top:5px}.panel{padding:16px}.toolbar{display:grid;grid-template-columns:180px minmax(240px,1fr) auto auto;gap:10px;align-items:center}.webhook-toolbar{grid-template-columns:140px minmax(240px,1fr) auto auto}.toolbar input,.toolbar select,.storage input,.field-input{width:100%;border:1px solid #ccd5e2;border-radius:9px;padding:9px 10px;background:#fff;color:#172033}.btn{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:9px 12px;cursor:pointer;color:#263349}.btn:hover{background:#f7f9fc}.btn:disabled{cursor:not-allowed;opacity:.5}.btn.primary{background:#111827;color:#fff;border-color:#111827}.btn.danger{color:#a01c1c;border-color:#efc0c0;background:#fff8f8}.btn.small{padding:6px 9px;font-size:12px}.table-wrap{overflow:auto;margin-top:14px;border:1px solid #e2e7f0;border-radius:12px;-webkit-overflow-scrolling:touch}table{width:100%;border-collapse:collapse;min-width:980px;background:#fff}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid #edf0f5;vertical-align:top;font-size:13px}th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;background:#fafbfc;position:sticky;top:0}.topic{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700}.message{max-width:420px;white-space:pre-wrap;word-break:break-word}.titleline{font-weight:700;margin-bottom:4px}.pill{display:inline-block;border-radius:999px;padding:3px 7px;background:#eef2f7;color:#526075;font-size:11px;margin:0 4px 4px 0}.pill.scheduled{background:#fff3d6;color:#805c00}.pill.hidden{background:#ece8ff;color:#5b46a4}.actions{display:flex;gap:6px;flex-wrap:wrap}.empty{text-align:center;color:#7b8798;padding:34px}.footer{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px}.storage{display:grid;grid-template-columns:1fr 160px auto;gap:12px;align-items:end}.storage-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.storage-note{background:#eef6ff;border:1px solid #cfe1fb;border-radius:10px;padding:10px 12px;color:#41628e;font-size:13px;line-height:1.6;margin-bottom:14px}.usage-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;margin-bottom:8px}.usage-title{font-weight:700}.progress{height:8px;background:#edf1f6;border-radius:99px;overflow:hidden}.progress>div{height:100%;background:#2f6fed;border-radius:99px;width:0}.storage-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.meta{background:#fafbfc;border:1px solid #edf0f5;border-radius:10px;padding:10px}.meta strong{display:block;margin-top:3px}.webhook-fields{display:grid;grid-template-columns:1fr;gap:10px}.webhook-fields label{font-size:13px;font-weight:600;color:#435066}.webhook-fields input{display:block;margin-top:6px}.toast{position:fixed;right:20px;bottom:20px;z-index:80;background:#111827;color:#fff;border-radius:10px;padding:11px 14px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.18);display:none;max-width:420px}.menu-overlay{display:none}
@media(max-width:900px){.app{grid-template-columns:220px minmax(0,1fr)}.main-inner{padding:22px 20px 36px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){body.menu-open{overflow:hidden}.app{display:block}.sidebar{position:fixed;left:0;top:0;z-index:60;width:min(82vw,290px);height:100dvh;transform:translateX(-102%);transition:transform .2s ease;box-shadow:12px 0 30px rgba(15,23,42,.2)}body.menu-open .sidebar{transform:translateX(0)}.menu-overlay{position:fixed;inset:0;z-index:50;background:rgba(15,23,42,.4);display:block;opacity:0;pointer-events:none;transition:opacity .2s ease}body.menu-open .menu-overlay{opacity:1;pointer-events:auto}.mobilebar{position:sticky;top:0;z-index:40;height:54px;padding:0 14px;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.96);border-bottom:1px solid #e2e7f0;backdrop-filter:blur(8px)}.menu-toggle{width:36px;height:36px;border:1px solid #d7deea;background:#fff;border-radius:9px;display:grid;place-items:center;cursor:pointer;color:#263349;font-size:18px}.mobile-title{font-size:15px;font-weight:750}.main-inner{padding:14px 12px 30px}.section-head{margin-bottom:14px}.section-head h1{font-size:22px}.section-head .badge{display:none}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}.metric{padding:12px}.metric strong{font-size:20px}.panel{padding:12px;border-radius:12px}.toolbar{grid-template-columns:1fr 1fr;gap:8px}.messages-toolbar #q{grid-column:1/-1}.messages-toolbar #topic{min-width:0}.webhook-toolbar{grid-template-columns:1fr}.webhook-toolbar label{font-size:12px;font-weight:600;color:#526075}.storage{grid-template-columns:1fr}.storage-meta{grid-template-columns:1fr}.footer{align-items:flex-start;flex-direction:column}.table-wrap{border-radius:10px}.toast{left:12px;right:12px;bottom:12px;max-width:none}.section-copy{max-width:92%}}
@media(max-width:420px){.grid{grid-template-columns:1fr 1fr}.metric strong{font-size:18px}.toolbar{grid-template-columns:1fr}.messages-toolbar #q{grid-column:auto}.messages-toolbar .btn{width:100%}.usage-row{align-items:flex-start}.storage-note{font-size:12px}.section-head h1{font-size:21px}}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar" id="sidebar">
    <div class="brand">
      <div class="brand-title">ntfy MCP 管理</div>
      <div class="brand-sub">消息、Webhook 与历史数据管理</div>
    </div>
    <nav class="nav" aria-label="管理功能">
      <button class="nav-item active" type="button" data-nav="messages" aria-current="page"><span class="nav-icon">M</span><span>消息明细</span></button>
      <button class="nav-item" type="button" data-nav="webhook"><span class="nav-icon">W</span><span>Webhook 管理</span></button>
      <button class="nav-item" type="button" data-nav="retention"><span class="nav-icon">S</span><span>历史数据保留</span></button>
    </nav>
    <div class="sidebar-foot">
      <div class="muted">服务地址</div>
      <div class="sidebar-url" id="baseUrl">正在读取状态…</div>
    </div>
  </aside>

  <main class="main">
    <div class="mobilebar">
      <button class="menu-toggle" type="button" id="menuToggle" aria-label="打开菜单" aria-controls="sidebar" aria-expanded="false">☰</button>
      <div class="mobile-title" id="mobileTitle">消息明细</div>
    </div>

    <div class="main-inner">
      <section class="view active" data-view="messages">
        <div class="section-head">
          <div><h1>消息明细</h1><div class="muted section-copy">查看 Worker + Durable Object 消息记录、Topic、投递状态与历史占用。</div></div>
        </div>
        <div class="grid">
          <div class="card metric"><span class="muted">消息记录</span><strong id="mMessages">—</strong></div>
          <div class="card metric"><span class="muted">Topics</span><strong id="mTopics">—</strong></div>
          <div class="card metric"><span class="muted">待投递</span><strong id="mScheduled">—</strong></div>
          <div class="card metric"><span class="muted">历史占用</span><strong id="mUsage">—</strong></div>
        </div>
        <div class="card panel">
          <div class="toolbar messages-toolbar">
            <select id="topic"><option value="">全部 topic</option></select>
            <input id="q" placeholder="搜索正文、标题、消息 ID、sequence ID" />
            <button class="btn" id="refresh">刷新</button>
            <button class="btn primary" id="publishTest">发送测试通知</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>时间</th><th>Topic</th><th>内容</th><th>状态</th><th>ID / Sequence</th><th>操作</th></tr></thead>
              <tbody id="rows"><tr><td colspan="6" class="empty">加载中…</td></tr></tbody>
            </table>
          </div>
          <div class="footer"><span class="muted" id="count">—</span><div><button class="btn small" id="prev">上一页</button> <button class="btn small" id="next">下一页</button></div></div>
        </div>
      </section>

      <section class="view" data-view="webhook">
        <div class="section-head">
          <div><h1>Webhook 管理</h1><div class="muted section-copy">生成第三方调用 URL，并管理全局默认规则与 topic 级字段映射。</div></div>
        </div>
        <div class="card panel" id="webhookPanel">
          <p class="muted" id="webhookStatus">读取 Webhook 配置中…</p>
          <div class="toolbar webhook-toolbar">
            <label for="webhookTopic">目标 topic</label>
            <input id="webhookTopic" placeholder="例如 AITrend" maxlength="64" />
            <button class="btn primary" id="webhookGenerate">生成 URL</button>
            <button class="btn" id="webhookCopy" disabled>复制</button>
          </div>
          <input class="field-input" id="webhookUrl" readonly aria-label="Webhook URL" style="margin:10px 0" placeholder="生成后显示完整 Webhook URL" />
          <p class="muted">URL 含发布凭证，仅提供给可信来源。通常无需修改以下映射即可接收通知。</p>
          <div class="toolbar webhook-toolbar">
            <label for="webhookScope">字段映射</label>
            <select id="webhookScope"><option value="global">全局默认规则</option><option value="topic">当前 topic 覆盖规则</option></select>
            <button class="btn" id="webhookLoad">读取配置</button>
            <button class="btn primary" id="webhookSave" disabled>保存规则</button>
          </div>
          <p class="muted">每项填写来源字段路径，多个路径用英文逗号分隔，按顺序尝试；支持 data.message、payload.url。留空表示继承。优先尝试 topic 规则，其次全局规则，再用内置规则。</p>
          <div class="webhook-fields">
            <label>标题 → title<input class="field-input" id="webhookTitle" placeholder="title, subject, name" /></label>
            <label>正文 → message<input class="field-input" id="webhookMessage" placeholder="message, summary, content, description, text, body" /></label>
            <label>点击链接 → click<input class="field-input" id="webhookClick" placeholder="url, link, href, click" /></label>
          </div>
          <p class="muted" id="webhookInheritance"></p>
        </div>
      </section>

      <section class="view" data-view="retention">
        <div class="section-head">
          <div><h1>历史数据自动保留</h1><div class="muted section-copy">按容量控制历史消息与附件，不按时间过期。</div></div>
          <span class="pill">自动清理</span>
        </div>
        <div class="card panel">
          <div class="storage-note">默认保留 700 MB，可配置 50–700 MB。超过上限后自动删除最旧的已投递消息及其附件，并清理到约 90% 水位；尚未投递的定时消息不会被自动删除。</div>
          <div class="usage-row"><div><div class="usage-title">ntfy 历史</div><div class="muted" id="usageText">已保留 — · SQLite —</div></div><div class="muted" id="usagePercent">—</div></div>
          <div class="progress"><div id="usageBar"></div></div>
          <div class="storage" style="margin-top:14px">
            <div class="storage-meta">
              <div class="meta"><span class="muted">消息估算</span><strong id="messageBytes">—</strong></div>
              <div class="meta"><span class="muted">附件</span><strong id="attachmentBytes">—</strong></div>
              <div class="meta"><span class="muted">累计自动删除</span><strong id="deletedTotal">—</strong></div>
            </div>
            <div><label class="muted">存储上限（MB）</label><input id="storageLimitMB" type="number" min="50" max="700" step="10" /></div>
            <button class="btn primary" id="saveStorage">保存</button>
          </div>
        </div>
      </section>
    </div>
  </main>
</div>
<div class="menu-overlay" id="menuOverlay" aria-hidden="true"></div>

<div class="toast" id="toast"></div>
<script>
const state={offset:0,limit:50,total:0};
const $=id=>document.getElementById(id);
const viewMeta={messages:'消息明细',webhook:'Webhook 管理',retention:'历史数据自动保留'};
function setView(name,updateHash=true){
  if(!viewMeta[name])name='messages';
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===name));
  document.querySelectorAll('[data-nav]').forEach(el=>{const active=el.dataset.nav===name;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
  $('mobileTitle').textContent=viewMeta[name];
  document.body.classList.remove('menu-open');
  $('menuToggle').setAttribute('aria-expanded','false');
  if(updateHash&&location.hash!=='#'+name)history.replaceState(null,'','#'+name);
}
document.querySelectorAll('[data-nav]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.nav)));
$('menuToggle').addEventListener('click',()=>{const open=!document.body.classList.contains('menu-open');document.body.classList.toggle('menu-open',open);$('menuToggle').setAttribute('aria-expanded',String(open))});
$('menuOverlay').addEventListener('click',()=>{document.body.classList.remove('menu-open');$('menuToggle').setAttribute('aria-expanded','false')});
window.addEventListener('hashchange',()=>setView(location.hash.slice(1),false));
setView(location.hash.slice(1)||'messages',false);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=t=>t?new Date(Number(t)*1000).toLocaleString():'—';
const size=n=>{n=Number(n||0);if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(1)+' MB'};
const toast=(text,bad=false)=>{const el=$('toast');el.textContent=text;el.style.background=bad?'#8b1e1e':'#111827';el.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.style.display='none',3200)};
async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||data.error||('HTTP '+r.status));return data}
async function loadStatus(){const s=await api('/admin/api/status');$('mMessages').textContent=s.messages;$('mTopics').textContent=s.topics;$('mScheduled').textContent=s.scheduled;$('mUsage').textContent=size(s.historyBytes);$('baseUrl').textContent=s.baseUrl||location.origin;const limit=Number(s.historyLimitBytes||700*1048576);const used=Number(s.historyBytes||0);$('storageLimitMB').value=Math.round(limit/1048576);$('usageText').textContent='已保留 '+size(used)+' · SQLite '+size(s.databaseBytes);const pct=limit?Math.min(100,used/limit*100):0;$('usagePercent').textContent=pct.toFixed(1)+'%';$('usageBar').style.width=pct+'%';$('messageBytes').textContent=size(s.messageBytes);$('attachmentBytes').textContent=size(s.attachmentBytes)+' / '+Number(s.attachmentCount||0)+' 个';$('deletedTotal').textContent=Number(s.totalDeletedMessages||0)+' 条'}
async function loadTopics(){const data=await api('/admin/api/topics');const current=$('topic').value;$('topic').innerHTML='<option value="">全部 topic</option>'+data.topics.map(t=>'<option value="'+esc(t.topic)+'">'+esc(t.topic)+' ('+t.messages+')</option>').join('');$('topic').value=current}
function statusPills(m){let out='<span class="pill">'+esc(m.event)+'</span>';if(!m.delivered)out+='<span class="pill scheduled">待投递 '+fmt(m.scheduledAt)+'</span>';if(!m.cacheVisible)out+='<span class="pill hidden">Cache:no</span>';return out}
function rowHtml(m){const title=m.title?'<div class="titleline">'+esc(m.title)+'</div>':'';const attach=m.attachment?'<div class="muted">附件：'+esc(m.attachment.name)+' · '+esc(m.attachment.type||'')+'</div>':'';return '<tr><td>'+fmt(m.time)+'</td><td class="topic">'+esc(m.topic)+'</td><td class="message">'+title+esc(m.message||'')+attach+'</td><td>'+statusPills(m)+'</td><td><div class="topic">'+esc(m.id)+'</div><div class="muted">'+esc(m.sequence_id||'')+'</div></td><td><div class="actions"><button class="btn danger small" data-delete="'+esc(m.id)+'">删除</button></div></td></tr>'}
async function loadMessages(){const p=new URLSearchParams({limit:String(state.limit),offset:String(state.offset)});if($('topic').value)p.set('topic',$('topic').value);if($('q').value.trim())p.set('q',$('q').value.trim());const data=await api('/admin/api/messages?'+p);state.total=data.total;$('rows').innerHTML=data.messages.length?data.messages.map(rowHtml).join(''):'<tr><td colspan="6" class="empty">没有消息记录</td></tr>';$('count').textContent='显示 '+(data.messages.length?state.offset+1:0)+'–'+Math.min(state.offset+data.messages.length,state.total)+' / '+state.total;$('prev').disabled=state.offset<=0;$('next').disabled=state.offset+state.limit>=state.total}
async function reload(){try{await Promise.all([loadStatus(),loadTopics(),loadMessages()])}catch(e){toast(e.message,true)}}
async function deleteNow(id){if(!confirm('删除消息 '+id+' 及其本地附件？此操作不可恢复。'))return;try{await api('/admin/api/delete',{method:'POST',body:JSON.stringify({ids:[id]})});toast('已删除');await reload()}catch(e){toast(e.message,true)}}
$('rows').addEventListener('click',e=>{const d=e.target.closest('[data-delete]');if(d)deleteNow(d.dataset.delete)});
$('refresh').onclick=()=>{state.offset=0;reload()};$('topic').onchange=()=>{state.offset=0;loadMessages()};let timer;$('q').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{state.offset=0;loadMessages()},250)};$('prev').onclick=()=>{state.offset=Math.max(0,state.offset-state.limit);loadMessages()};$('next').onclick=()=>{state.offset+=state.limit;loadMessages()};
$('saveStorage').onclick=async()=>{try{const limitMB=Number($('storageLimitMB').value);await api('/admin/api/storage-limit',{method:'POST',body:JSON.stringify({limitMB})});toast('存储上限已更新');await reload()}catch(e){toast(e.message,true)}};
$('publishTest').onclick=async()=>{const topic=$('topic').value||prompt('发送到哪个 topic？','test-zhenhua');if(!topic)return;try{const data=await api('/admin/api/test-publish',{method:'POST',body:JSON.stringify({topic})});toast('测试通知已发送：'+data.id);setTimeout(reload,300)}catch(e){toast(e.message,true)}};
const webhookFields={title:'webhookTitle',message:'webhookMessage',click:'webhookClick'};
let webhookLoaded=null;
const webhookSelection=()=>({scope:$('webhookScope').value,topic:$('webhookTopic').value.trim()});
const splitMappingPaths=value=>String(value||'').split(/[,，;；\s]+/).map(s=>s.trim()).filter(Boolean);
const mappingPaths=(mapping,field)=>Array.isArray(mapping?.[field])?mapping[field].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()):typeof mapping?.[field]==='string'?splitMappingPaths(mapping[field]):[];
function invalidateWebhook(){webhookLoaded=null;$('webhookSave').disabled=true}
async function loadWebhook(showToast=false){
  const selected=webhookSelection();invalidateWebhook();
  try{
    if(selected.scope==='topic'&&!selected.topic)throw new Error('请先输入 topic');
    const query=selected.scope==='topic'?'?topic='+encodeURIComponent(selected.topic):'';
    const data=await api('/admin/api/webhook/config'+query);
    if(JSON.stringify(selected)!==JSON.stringify(webhookSelection()))return;
    const mapping=selected.scope==='topic'?(data.topic||{}):(data.global||{});
    const globalMapping=data.global||{},defaults=data.defaults||{};
    for(const [field,id] of Object.entries(webhookFields)){
      const explicit=mappingPaths(mapping,field);
      const inherited=selected.scope==='topic'
        ? [...mappingPaths(globalMapping,field),...mappingPaths(defaults,field)]
        : mappingPaths(defaults,field);
      $(id).value=explicit.join(', ');
      $(id).placeholder=inherited.length?'继承：'+[...new Set(inherited)].join(', '):'留空表示继承';
    }
    const hasExplicit=Object.keys(webhookFields).some(field=>mappingPaths(mapping,field).length);
    if(!data.enabled)$('webhookStatus').textContent='尚未启用：请先在 Cloudflare Worker 的机密中配置 WEBHOOK_MASTER_SECRET。';
    else if(selected.scope==='topic')$('webhookStatus').textContent=hasExplicit?'已读取 '+selected.topic+' 的 topic 覆盖规则。':'当前 topic 未配置覆盖规则，将继承全局默认规则和内置规则。';
    else $('webhookStatus').textContent=hasExplicit?'已读取全局默认规则。':'当前未保存全局自定义规则，将直接使用内置规则。';
    $('webhookInheritance').textContent=Object.keys(webhookFields).map(field=>{
      const inherited=selected.scope==='topic'
        ? [...mappingPaths(globalMapping,field),...mappingPaths(defaults,field)]
        : mappingPaths(defaults,field);
      return field+' 继承：'+([...new Set(inherited)].join(', ')||'无');
    }).join('；');
    webhookLoaded=selected;$('webhookSave').disabled=false;
    if(showToast)toast(selected.scope==='topic'?'已读取当前 topic 配置':'已读取全局默认配置');
  }catch(e){toast(e.message,true)}
}
$('webhookLoad').onclick=()=>loadWebhook(true);
$('webhookScope').onchange=()=>loadWebhook(false);
$('webhookTopic').oninput=()=>{invalidateWebhook();$('webhookUrl').value='';$('webhookCopy').disabled=true;if($('webhookScope').value==='topic')$('webhookStatus').textContent='topic 已变化，请读取该 topic 的覆盖规则。'};
$('webhookGenerate').onclick=async()=>{try{
  const topic=$('webhookTopic').value.trim();
  const data=await api('/admin/api/webhook/url',{method:'POST',body:JSON.stringify({topic})});
  if(topic!==$('webhookTopic').value.trim())return;
  $('webhookUrl').value=data.url;$('webhookCopy').disabled=false;
}catch(e){toast(e.message,true)}};
$('webhookCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('webhookUrl').value);toast('Webhook URL 已复制')}catch(e){$('webhookUrl').select();toast('请手动复制选中的 URL',true)}};
$('webhookSave').onclick=async()=>{try{
  const selected=webhookSelection();
  if(!webhookLoaded||JSON.stringify(selected)!==JSON.stringify(webhookLoaded))throw new Error('请先读取当前配置');
  const mapping={};
  for(const [field,id] of Object.entries(webhookFields)){const paths=[...new Set(splitMappingPaths($(id).value))];if(paths.length)mapping[field]=paths}
  $('webhookSave').disabled=true;
  await api('/admin/api/webhook/config',{method:'PUT',body:JSON.stringify({...selected,mapping})});
  toast(selected.scope==='topic'?'topic 覆盖规则已保存':'全局默认规则已保存');await loadWebhook(false);
}catch(e){toast(e.message,true);$('webhookSave').disabled=!webhookLoaded}};
loadWebhook();
reload();
</script>
</body></html>`;

