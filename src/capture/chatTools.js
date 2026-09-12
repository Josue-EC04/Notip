(() => {
'use strict';
const api=window.electronAPI;
const root=document.getElementById('chat-tools');
const $=id=>root.querySelector('#'+id);
function returnToChat(){root.hidden=true;document.getElementById('view-capture').classList.remove('tools-open');document.getElementById('capture-dynamic-area').classList.remove('hidden');document.getElementById('note-input').focus();}
$('close-chat-tools').onclick=returnToChat;
let state={entries:[],sessions:[]},editing=null,minutes=15,selectedTask=null,focusSession=null,noticeTimer;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>new Date(s).toLocaleString('es-PE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const labels={pending:'Por organizar',processing:'Organizando…',error:'Pendiente de reintento',done:'Organizada',active:'En clase'};
function notify(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('message').hidden=true,7000);}
async function call(name,...args){const r=await api[name](...args);if(!r?.success)throw Error(r?.error||'No se pudo completar.');return r.data;}
async function action(fn){try{await fn();}catch(e){notify(e.message);}}
function tab(name){if(!['inbox','classes','focus'].includes(name))return;root.hidden=false;root.dataset.tool=name;document.getElementById('view-capture').classList.add('tools-open');document.getElementById('capture-dynamic-area').classList.add('hidden');$('tool-title').textContent={inbox:'Pendientes',classes:'Mis clases',focus:'Tengo 15 minutos'}[name];for(const t of ['inbox','classes','focus'])$(t+'-view').hidden=t!==name;root.scrollTop=0;if(name==='focus')action(loadRecommendation);}
function render(){
  const pending=state.entries.filter(e=>e.status!=='done').length;
  $('connection').textContent=state.paused?'IA en pausa · guardado local activo':!state.configured?'Guardado local · configura IA en Ajustes':state.processing?'Organizando tus capturas…':state.connection==='unavailable'?'Sin acceso a IA · tus capturas están guardadas':`${pending} por organizar · guardado local activo`;
  $('pause-ai').textContent=state.paused?'Reanudar IA':'Pausar IA';$('retry').disabled=state.processing||state.paused||!state.configured;
  renderInbox();renderClasses();
}
function renderInbox(){
  const q=$('inbox-search').value.toLowerCase();const entries=state.entries.filter(e=>($('show-done').checked||e.status!=='done')&&`${e.text} ${e.result?.titulo_corto||''}`.toLowerCase().includes(q)).slice().reverse();
  const list=$('inbox-list');list.innerHTML='';
  if(!entries.length){list.innerHTML=`<div class="empty"><h3>${q?'No hay coincidencias':'Una mente un poco más ligera.'}</h3><p>${q?'Prueba con otra palabra.':'Aquí verás lo pendiente. Activa “Ver organizadas” para recuperar tus capturas anteriores.'}</p></div>`;return;}
  for(const e of entries){
    const card=document.createElement('article');card.className='card';
    const session=state.sessions.find(s=>s.id===e.sessionId);
    card.innerHTML=`<div class="card-top"><span class="badge ${esc(e.status)}">${esc(labels[e.status])}${e.source==='manual'?' · manual':''}</span><span class="date">${esc(date(e.created))}</span></div>${e.result?`<h3>${esc(e.result.titulo_corto)}</h3>`:''}<p class="preserve">${esc(e.result?.texto_reescrito||e.text)}</p>${session?`<p class="footnote">Clase · ${esc(session.name)}</p>`:''}${e.error?`<p class="error-text">${esc(e.error)}</p>`:''}<details><summary>Ver texto original</summary><p class="preserve">${esc(e.original)}</p></details><div class="actions"></div>`;
    const actions=card.querySelector('.actions');
    if(e.status!=='done'){
      const edit=button('Editar',()=>{editing=e.id;$('edit-text').value=e.text;$('edit-dialog').showModal();});actions.append(edit);
      const type=document.createElement('select');type.setAttribute('aria-label','Organizar manualmente');type.innerHTML='<option value="nota">Nota</option><option value="idea">Idea</option><option value="tarea">Tarea</option>';
      actions.append(type,button('Guardar sin IA',()=>action(async()=>{await call('studyManual',e.id,type.value);notify('Organizada manualmente. No necesita internet.');})),button('Eliminar',()=>action(async()=>{if(confirm('¿Eliminar esta captura pendiente?'))await call('studyDelete',e.id);}), 'danger'));
    }else{
      actions.append(button(e.result?.tipo==='tarea'?'Ver tablero':'Abrir pizarra',()=>e.result?.tipo==='tarea'?api.openBoard():api.openCanvas()));
      const related=document.createElement('div');card.append(related);
      call('studyRelated',e.result?.texto_reescrito||e.text,e.filename).then(found=>{if(!card.isConnected||!found.length)return;related.className='related';related.innerHTML='<h4>Esto conecta con una idea tuya</h4>';for(const n of found){const row=document.createElement('div');row.className='related-item';row.innerHTML=`<div><strong>${esc(n.titulo)}</strong><p>${esc(n.reason)}</p></div>`;row.append(button('Ver',()=>{$('related-title').textContent=n.titulo;$('related-content').textContent=n.preview;$('related-dialog').showModal();}),button('Conectar',()=>action(async()=>{await call('studyConnect',e.id,n.filename);notify('Conexión guardada en tu cerebro.');})));related.append(row);}}).catch(()=>{});
    }
    list.append(card);
  }
}
function button(text,handler,cls=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;b.addEventListener('click',handler);return b;}
$('inbox-search').oninput=renderInbox;$('show-done').onchange=renderInbox;
$('edit-cancel').onclick=()=>$('edit-dialog').close();$('related-close').onclick=()=>$('related-dialog').close();
$('edit-form').onsubmit=e=>{e.preventDefault();action(async()=>{await call('studyEdit',editing,$('edit-text').value);$('edit-dialog').close();notify('Cambios guardados; se organizará la última versión.');});};
$('retry').onclick=()=>action(async()=>{await call('studyRetry');notify('Revisando capturas y resúmenes pendientes…');});
$('pause-ai').onclick=()=>action(async()=>{await call('studyPause',!state.paused);});
$('class-form').onsubmit=e=>{e.preventDefault();action(async()=>{await call('studyStartClass',$('class-name').value);$('class-name').value='';notify('Clase iniciada. Las nuevas capturas se agruparán aquí.');returnToChat();});};
function renderClasses(){
  const active=state.sessions.find(s=>s.id===state.activeSessionId);$('class-form').hidden=!!active;$('active-class').hidden=!active;
  if(active){const el=$('active-class');el.innerHTML=`<span class="eyebrow">CLASE EN CURSO</span><h2>${esc(active.name)}</h2><p>${state.entries.filter(e=>e.sessionId===active.id).length} capturas · iniciada ${esc(date(active.created))}</p><div class="actions"></div>`;el.querySelector('.actions').append(button('Añadir apunte',()=>{returnToChat();}),button('Terminar y resumir',()=>action(async()=>{await call('studyEndClass');notify('Clase terminada. El resumen llegará al organizar sus capturas con IA.');}),'primary'));}
  const list=$('class-list');list.innerHTML='';const sessions=state.sessions.filter(s=>s.id!==state.activeSessionId);
  if(!sessions.length){list.innerHTML='<div class="empty"><h3>Tu próxima clase empieza aquí.</h3><p>Al terminar tendrás tus apuntes, dudas y entregas reunidos.</p></div>';return;}
  for(const s of sessions){const entries=state.entries.filter(e=>e.sessionId===s.id);const card=document.createElement('article');card.className='card';card.innerHTML=`<div class="card-top"><h2>${esc(s.name)}</h2><span class="badge ${esc(s.status)}">${s.status==='done'?'Resumen listo':esc(labels[s.status])}</span></div><p class="date">${esc(date(s.created))} · ${entries.length} capturas</p>${s.error?`<p class="error-text">${esc(s.error)}</p>`:''}`;
    if(s.report){const report=document.createElement('div');report.className='report';report.innerHTML=`<p class="preserve">${esc(s.report.resumen)}</p>`;for(const [key,title] of [['conceptos','Conceptos importantes'],['dudas','Dudas que anotaste'],['preguntas','Preguntas para repasar']]){report.innerHTML+=`<h3>${title}</h3>${s.report[key]?.length?`<ul>${s.report[key].map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p>No se registraron.</p>'}`;}card.append(report);}else card.innerHTML+='<p class="footnote">Tus apuntes ya están guardados. El resumen espera a que se organicen todas las capturas.</p>';
    const tasks=entries.filter(e=>e.result?.tipo==='tarea');const details=document.createElement('details');details.innerHTML=`<summary>Ver ${entries.length} apuntes y ${tasks.length} tareas</summary>${entries.map(e=>`<p class="preserve"><strong>${esc(e.result?.tipo||'Pendiente')}</strong> · ${esc(e.text)}</p>`).join('')}`;card.append(details);if(tasks.length)card.append(button('Abrir tareas',()=>api.openBoard()));list.append(card);
  }
}
root.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{if(focusSession){notify('Termina o cancela el bloque actual antes de cambiar el tiempo.');return;}minutes=Number(b.dataset.minutes);document.querySelectorAll('[data-minutes]').forEach(x=>x.classList.toggle('selected',x===b));action(loadRecommendation);});
async function loadRecommendation(){
  if(focusSession){renderFocus();return;}
  selectedTask=await call('studyRecommend',minutes);renderFocus();
}
function renderFocus(){
  const r=focusSession?.recommendation||selectedTask;const el=$('recommendation');
  if(!r){el.innerHTML='<div class="empty"><h3>Sin pendientes por ahora.</h3><p>Crea una tarea en el tablero o convierte una captura en tarea.</p></div>';return;}
  el.innerHTML=`<article class="focus-card"><span class="eyebrow">${r.partial?'AVANZA UNA PARTE':'UNA TAREA A TU ALCANCE'}</span><h2>${esc(r.task.titulo)}</h2><p>${esc(r.reason)} ${r.estimated} min ${r.task.duracion_min?'estimados por ti':'estimados por defecto'}.</p><div class="step"><span>TU PRIMER PASO</span><p>${esc(r.step)}</p></div><div class="row" id="focus-actions"></div><details><summary>Ajustar duración y primer paso</summary><form class="effort" id="effort-form"><label>Duración de la tarea<select id="effort-minutes">${[5,15,30,60].map(m=>`<option value="${m}" ${r.estimated===m?'selected':''}>${m} minutos</option>`).join('')}</select></label><label>Primer paso concreto<input id="effort-step" maxlength="500" value="${esc(r.task.primer_paso||'')}" placeholder="Por ejemplo: resolver el primer ejercicio"></label><button>Guardar preferencia</button></form></details></article>`;
  const actions=$('focus-actions');
  if(focusSession){actions.append(button('Terminar bloque',()=>action(async()=>{focusSession=null;localStorage.removeItem('notip_focus_session');notify('Buen avance. La tarea sigue pendiente hasta que la marques como terminada.');await loadRecommendation();})),button('Cancelar',()=>{focusSession=null;localStorage.removeItem('notip_focus_session');renderFocus();}));const clock=document.createElement('span');clock.id='focus-clock';clock.className='timer';actions.append(clock);tick();}
  else actions.append(button(`Empezar ${minutes} minutos`,()=>{focusSession={endsAt:Date.now()+minutes*60000,recommendation:r};localStorage.setItem('notip_focus_session',JSON.stringify(focusSession));renderFocus();},'primary'),button('Marcar tarea terminada',()=>action(async()=>{const result=await api.updateTaskState(r.task.id,'hecho');if(!result)throw Error('La tarea ya no está disponible.');notify('Tarea terminada.');await loadRecommendation();})));
  $('effort-form').onsubmit=e=>{e.preventDefault();action(async()=>{await call('studyTaskEffort',r.task.id,Number($('effort-minutes').value),$('effort-step').value);notify('Duración y primer paso guardados.');if(!focusSession)await loadRecommendation();});};
}
function tick(){if(!focusSession)return;const remaining=Math.max(0,Math.ceil((focusSession.endsAt-Date.now())/1000));const el=$('focus-clock');if(el)el.textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;if(!remaining&&!focusSession.notified){focusSession.notified=true;notify('Terminó tu bloque. Guarda lo que avanzaste y decide el siguiente paso.');}}
try{focusSession=JSON.parse(localStorage.getItem('notip_focus_session')||'null');if(focusSession&&!focusSession.recommendation)focusSession=null;}catch(_){}
setInterval(tick,1000);
api.on('study-updated',s=>{state=s;render();});api.on('study-tab',tab);api.on('board-tasks-updated',()=>{if(!$('focus-view').hidden&&!focusSession)action(loadRecommendation);});
window.addEventListener('online',()=>api.studyOnline());
action(async()=>{state=await call('studyState');render();});

})();
