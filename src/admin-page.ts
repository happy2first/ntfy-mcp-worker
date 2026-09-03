export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ntfy MCP 管理</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}.shell{max-width:1220px;margin:0 auto;padding:24px}.topbar{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.title h1{font-size:28px;line-height:1.15;margin:0 0 6px}.muted{color:#687386;font-size:13px}.badge{display:inline-flex;align-items:center;border:1px solid #d7deea;background:#fff;border-radius:999px;padding:7px 11px;font-size:12px;color:#526075}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.card{background:#fff;border:1px solid #e2e7f0;border-radius:14px;box-shadow:0 5px 18px rgba(30,45,70,.05)}.metric{padding:16px}.metric strong{display:block;font-size:24px;margin-top:5px}.panel{padding:16px;margin-top:14px}.toolbar{display:grid;grid-template-columns:180px 1fr auto auto;gap:10px;align-items:center}.toolbar input,.toolbar select,.retention input{width:100%;border:1px solid #ccd5e2;border-radius:9px;padding:9px 10px;background:#fff;color:#172033}.btn{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:9px 12px;cursor:pointer;color:#263349}.btn:hover{background:#f7f9fc}.btn.primary{background:#111827;color:#fff;border-color:#111827}.btn.danger{color:#a01c1c;border-color:#efc0c0;background:#fff8f8}.btn.small{padding:6px 9px;font-size:12px}.table-wrap{overflow:auto;margin-top:14px;border:1px solid #e2e7f0;border-radius:12px}table{width:100%;border-collapse:collapse;min-width:1050px;background:#fff}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid #edf0f5;vertical-align:top;font-size:13px}th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;background:#fafbfc;position:sticky;top:0}.topic{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700}.message{max-width:380px;white-space:pre-wrap;word-break:break-word}.titleline{font-weight:700;margin-bottom:4px}.pill{display:inline-block;border-radius:999px;padding:3px 7px;background:#eef2f7;color:#526075;font-size:11px;margin:0 4px 4px 0}.pill.scheduled{background:#fff3d6;color:#805c00}.pill.delete{background:#ffe5e5;color:#8d1616}.pill.hidden{background:#ece8ff;color:#5b46a4}.actions{display:flex;gap:6px;flex-wrap:wrap}.empty{text-align:center;color:#7b8798;padding:34px}.footer{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px}.retention{display:grid;grid-template-columns:1fr 160px auto;gap:10px;align-items:end}.toast{position:fixed;right:20px;bottom:20px;background:#111827;color:#fff;border-radius:10px;padding:11px 14px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.18);display:none;max-width:420px}.modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.42);display:none;align-items:center;justify-content:center;padding:20px}.modal{width:min(480px,100%);background:#fff;border-radius:15px;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.24)}.modal h3{margin:0 0 8px}.modal input{width:100%;border:1px solid #ccd5e2;border-radius:9px;padding:9px 10px;margin:10px 0 14px}.modal-actions{display:flex;justify-content:flex-end;gap:8px}@media(max-width:800px){.grid{grid-template-columns:repeat(2,1fr)}.toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1}.retention{grid-template-columns:1fr}.shell{padding:14px}.topbar{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<div class="shell">
  <div class="topbar">
    <div class="title"><h1>ntfy MCP 管理</h1><div class="muted">Worker + Durable Object 消息记录、订阅状态与清理策略</div></div>
    <div class="badge" id="baseUrl">正在读取状态…</div>
  </div>

  <div class="grid">
    <div class="card metric"><span class="muted">消息记录</span><strong id="mMessages">—</strong></div>
    <div class="card metric"><span class="muted">Topics</span><strong id="mTopics">—</strong></div>
    <div class="card metric"><span class="muted">待投递</span><strong id="mScheduled">—</strong></div>
    <div class="card metric"><span class="muted">待自动删除</span><strong id="mDeletes">—</strong></div>
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
    <div class="retention">
      <div><div style="font-weight:700;margin-bottom:4px">消息缓存保留时间</div><div class="muted">对应 ntfy cache-duration。定时投递消息从实际投递时间起计算；单条消息可另设管理删除时间。</div></div>
      <div><label class="muted">小时</label><input id="retentionHours" type="number" min="0.083" max="720" step="0.5" /></div>
      <button class="btn" id="saveRetention">保存</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>
<div class="modal-backdrop" id="modalBackdrop">
  <div class="modal">
    <h3>定时删除消息记录</h3>
    <div class="muted" id="modalId"></div>
    <input type="datetime-local" id="deleteAt" />
    <div class="modal-actions"><button class="btn" id="cancelModal">取消</button><button class="btn" id="clearDelete">取消已有定时删除</button><button class="btn primary" id="saveDelete">保存</button></div>
  </div>
</div>
<script>
const state={offset:0,limit:50,total:0,currentDeleteId:null};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=t=>t?new Date(Number(t)*1000).toLocaleString():'—';
const toast=(text,bad=false)=>{const el=$('toast');el.textContent=text;el.style.background=bad?'#8b1e1e':'#111827';el.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.style.display='none',3200)};
async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||data.error||('HTTP '+r.status));return data}
async function loadStatus(){const s=await api('/admin/api/status');$('mMessages').textContent=s.messages;$('mTopics').textContent=s.topics;$('mScheduled').textContent=s.scheduled;$('mDeletes').textContent=s.pendingDeletes;$('baseUrl').textContent=s.baseUrl||location.origin;$('retentionHours').value=(Number(s.retentionSeconds||43200)/3600).toFixed(1)}
async function loadTopics(){const data=await api('/admin/api/topics');const current=$('topic').value;$('topic').innerHTML='<option value="">全部 topic</option>'+data.topics.map(t=>'<option value="'+esc(t.topic)+'">'+esc(t.topic)+' ('+t.messages+')</option>').join('');$('topic').value=current}
function statusPills(m){let out='';out+='<span class="pill">'+esc(m.event)+'</span>';if(!m.delivered)out+='<span class="pill scheduled">待投递 '+fmt(m.scheduledAt)+'</span>';if(m.deleteAt)out+='<span class="pill delete">删除 '+fmt(m.deleteAt)+'</span>';if(!m.cacheVisible)out+='<span class="pill hidden">Cache:no</span>';return out}
function rowHtml(m){const title=m.title?'<div class="titleline">'+esc(m.title)+'</div>':'';const attach=m.attachment?'<div class="muted">附件：'+esc(m.attachment.name)+' · '+esc(m.attachment.type||'')+'</div>':'';return '<tr><td>'+fmt(m.time)+'</td><td class="topic">'+esc(m.topic)+'</td><td class="message">'+title+esc(m.message||'')+attach+'</td><td>'+statusPills(m)+'</td><td><div class="topic">'+esc(m.id)+'</div><div class="muted">'+esc(m.sequence_id||'')+'</div></td><td><div class="actions"><button class="btn small" data-schedule="'+esc(m.id)+'">定时删除</button><button class="btn danger small" data-delete="'+esc(m.id)+'">立即删除</button></div></td></tr>'}
async function loadMessages(){const p=new URLSearchParams({limit:String(state.limit),offset:String(state.offset)});if($('topic').value)p.set('topic',$('topic').value);if($('q').value.trim())p.set('q',$('q').value.trim());const data=await api('/admin/api/messages?'+p);state.total=data.total;$('rows').innerHTML=data.messages.length?data.messages.map(rowHtml).join(''):'<tr><td colspan="6" class="empty">没有消息记录</td></tr>';$('count').textContent='显示 '+(data.messages.length?state.offset+1:0)+'–'+Math.min(state.offset+data.messages.length,state.total)+' / '+state.total;$('prev').disabled=state.offset<=0;$('next').disabled=state.offset+state.limit>=state.total}
async function reload(){try{await Promise.all([loadStatus(),loadTopics(),loadMessages()])}catch(e){toast(e.message,true)}}
async function deleteNow(id){if(!confirm('立即物理删除消息 '+id+' 及其本地附件？此操作不可恢复。'))return;try{await api('/admin/api/delete',{method:'POST',body:JSON.stringify({ids:[id]})});toast('已删除');await reload()}catch(e){toast(e.message,true)}}
function openSchedule(id){state.currentDeleteId=id;$('modalId').textContent=id;const d=new Date(Date.now()+24*3600*1000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('deleteAt').value=d.toISOString().slice(0,16);$('modalBackdrop').style.display='flex'}
function closeModal(){$('modalBackdrop').style.display='none';state.currentDeleteId=null}
async function saveSchedule(clear=false){if(!state.currentDeleteId)return;try{const deleteAt=clear?null:new Date($('deleteAt').value).toISOString();await api('/admin/api/schedule-delete',{method:'POST',body:JSON.stringify({id:state.currentDeleteId,deleteAt})});toast(clear?'已取消定时删除':'已设置定时删除');closeModal();await reload()}catch(e){toast(e.message,true)}}
$('rows').addEventListener('click',e=>{const d=e.target.closest('[data-delete]');if(d)deleteNow(d.dataset.delete);const s=e.target.closest('[data-schedule]');if(s)openSchedule(s.dataset.schedule)});
$('refresh').onclick=()=>{state.offset=0;reload()};$('topic').onchange=()=>{state.offset=0;loadMessages()};let timer;$('q').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{state.offset=0;loadMessages()},250)};$('prev').onclick=()=>{state.offset=Math.max(0,state.offset-state.limit);loadMessages()};$('next').onclick=()=>{state.offset+=state.limit;loadMessages()};
$('cancelModal').onclick=closeModal;$('saveDelete').onclick=()=>saveSchedule(false);$('clearDelete').onclick=()=>saveSchedule(true);$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeModal()});
$('saveRetention').onclick=async()=>{try{const hours=Number($('retentionHours').value);await api('/admin/api/retention',{method:'POST',body:JSON.stringify({seconds:Math.round(hours*3600)})});toast('保留时间已更新');await loadStatus()}catch(e){toast(e.message,true)}};
$('publishTest').onclick=async()=>{const topic=$('topic').value||prompt('发送到哪个 topic？','alerts');if(!topic)return;try{const r=await fetch('/'+encodeURIComponent(topic),{method:'POST',headers:{'Title':'ntfy-mcp-worker 测试','Tags':'white_check_mark','Priority':'high'},body:'来自 ntfy MCP Worker 管理页的测试通知'});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||('HTTP '+r.status));toast('测试通知已发送：'+data.id);setTimeout(reload,300)}catch(e){toast(e.message,true)}};
reload();
</script>
</body></html>`;
