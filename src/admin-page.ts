export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ntfy MCP 管理</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}.shell{max-width:1220px;margin:0 auto;padding:24px}.topbar{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.title h1{font-size:28px;line-height:1.15;margin:0 0 6px}.muted{color:#687386;font-size:13px}.badge{display:inline-flex;align-items:center;border:1px solid #d7deea;background:#fff;border-radius:999px;padding:7px 11px;font-size:12px;color:#526075}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.card{background:#fff;border:1px solid #e2e7f0;border-radius:14px;box-shadow:0 5px 18px rgba(30,45,70,.05)}.metric{padding:16px}.metric strong{display:block;font-size:24px;margin-top:5px}.panel{padding:16px;margin-top:14px}.toolbar{display:grid;grid-template-columns:180px 1fr auto auto;gap:10px;align-items:center}.toolbar input,.toolbar select,.storage input{width:100%;border:1px solid #ccd5e2;border-radius:9px;padding:9px 10px;background:#fff;color:#172033}.btn{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:9px 12px;cursor:pointer;color:#263349}.btn:hover{background:#f7f9fc}.btn.primary{background:#111827;color:#fff;border-color:#111827}.btn.danger{color:#a01c1c;border-color:#efc0c0;background:#fff8f8}.btn.small{padding:6px 9px;font-size:12px}.table-wrap{overflow:auto;margin-top:14px;border:1px solid #e2e7f0;border-radius:12px}table{width:100%;border-collapse:collapse;min-width:980px;background:#fff}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid #edf0f5;vertical-align:top;font-size:13px}th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;background:#fafbfc;position:sticky;top:0}.topic{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700}.message{max-width:420px;white-space:pre-wrap;word-break:break-word}.titleline{font-weight:700;margin-bottom:4px}.pill{display:inline-block;border-radius:999px;padding:3px 7px;background:#eef2f7;color:#526075;font-size:11px;margin:0 4px 4px 0}.pill.scheduled{background:#fff3d6;color:#805c00}.pill.hidden{background:#ece8ff;color:#5b46a4}.actions{display:flex;gap:6px;flex-wrap:wrap}.empty{text-align:center;color:#7b8798;padding:34px}.footer{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px}.storage{display:grid;grid-template-columns:1fr 160px auto;gap:12px;align-items:end}.storage-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.storage-note{background:#eef6ff;border:1px solid #cfe1fb;border-radius:10px;padding:10px 12px;color:#41628e;font-size:13px;line-height:1.6;margin-bottom:14px}.usage-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;margin-bottom:8px}.usage-title{font-weight:700}.progress{height:8px;background:#edf1f6;border-radius:99px;overflow:hidden}.progress>div{height:100%;background:#2f6fed;border-radius:99px;width:0}.storage-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.meta{background:#fafbfc;border:1px solid #edf0f5;border-radius:10px;padding:10px}.meta strong{display:block;margin-top:3px}.toast{position:fixed;right:20px;bottom:20px;background:#111827;color:#fff;border-radius:10px;padding:11px 14px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.18);display:none;max-width:420px}@media(max-width:800px){.grid{grid-template-columns:repeat(2,1fr)}.toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1}.storage{grid-template-columns:1fr}.storage-meta{grid-template-columns:1fr}.shell{padding:14px}.topbar{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<div class="shell">
  <div class="topbar">
    <div class="title"><h1>ntfy MCP 管理</h1><div class="muted">Worker + Durable Object 消息记录、Topic 与历史数据自动保留</div></div>
    <div class="badge" id="baseUrl">正在读取状态…</div>
  </div>

  <div class="grid">
    <div class="card metric"><span class="muted">消息记录</span><strong id="mMessages">—</strong></div>
    <div class="card metric"><span class="muted">Topics</span><strong id="mTopics">—</strong></div>
    <div class="card metric"><span class="muted">待投递</span><strong id="mScheduled">—</strong></div>
    <div class="card metric"><span class="muted">历史占用</span><strong id="mUsage">—</strong></div>
  </div>

  <div class="card panel">
    <div class="toolbar">
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

  <div class="card panel">
    <div class="storage-head"><div><div style="font-weight:700">历史数据自动保留</div><div class="muted">按容量控制，不按时间过期</div></div><span class="pill">自动清理</span></div>
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
</div>

<div class="toast" id="toast"></div>
<script>
const state={offset:0,limit:50,total:0};
const $=id=>document.getElementById(id);
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
reload();
</script>
</body></html>`;
