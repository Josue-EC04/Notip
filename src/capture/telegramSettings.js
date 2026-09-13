(() => {
  const api=window.electronAPI;
  const panel=document.createElement('details');panel.id='telegram-settings';panel.className='settings-section';
  panel.innerHTML=`<summary class="settings-section-title">Recordatorios por Telegram</summary>
    <p class="settings-help">Tus pendientes llegan a tu celular mientras Notip esté abierto y este equipo tenga internet. No usa saldo de IA.</p>
    <div id="telegram-setup">
      <ol class="settings-help"><li>Abre BotFather y envía <strong>/newbot</strong>.</li><li>Elige un nombre y un usuario terminado en <strong>bot</strong>.</li><li>Copia el token que te entrega y pégalo aquí. Usa un bot exclusivo para este equipo.</li></ol>
      <button type="button" id="telegram-botfather" class="btn-settings-action secondary">Abrir BotFather</button>
      <div class="settings-input-group"><input type="password" id="telegram-token" aria-label="Token de Telegram" placeholder="Token de BotFather" autocomplete="off" spellcheck="false"></div>
      <button type="button" id="telegram-connect" class="btn-settings-action primary">Conectar bot</button>
    </div>
    <p id="telegram-connection" class="settings-help" role="status"></p>
    <button type="button" id="telegram-pair" class="btn-settings-action primary" hidden>Abrir mi bot y pulsar Iniciar</button>
    <form id="telegram-options" hidden>
      <label><input type="checkbox" id="telegram-enabled"> Activar recordatorios</label>
      <label>Resumen diario <input type="time" id="telegram-daily" required value="18:00"></label>
      <label><input type="checkbox" id="telegram-urgent" checked> Avisar de entregas próximas</label>
      <div class="telegram-hours"><label>Descanso desde <input type="time" id="telegram-quiet-start" required value="22:00"></label><label>Hasta <input type="time" id="telegram-quiet-end" required value="08:00"></label></div>
      <p class="settings-help">Hora de este equipo. Como máximo un aviso automático por hora, salvo recordatorios que tú pospongas. Puedes usar /pendientes, /pausa y /reanudar en Telegram.</p>
      <div class="settings-actions-row"><button class="btn-settings-action primary" type="submit">Guardar horarios</button><button type="button" id="telegram-test" class="btn-settings-action secondary">Enviar prueba</button></div>
    </form>
    <button type="button" id="telegram-disconnect" class="btn-settings-action secondary" hidden>Desconectar bot</button>
    <p id="telegram-status" class="settings-help" role="status" aria-live="polite"></p>`;
  document.querySelector('#modal-settings .modal-body').append(panel);
  const $=id=>document.getElementById('telegram-'+id);let state={},busy=false,dirty=false;
  function render(s){state=s;$('setup').hidden=s.configured;$('options').hidden=!s.linked;$('disconnect').hidden=!s.configured;$('pair').hidden=!s.pairUrl;
    $('connection').textContent=s.error||(s.linked?`Conectado a @${s.username}. ${s.enabled?'Avisos activados.':'Avisos pausados.'}`:s.configured?s.pairUrl?'Falta abrir tu bot y pulsar Iniciar. Este enlace vence en 10 minutos.':'El enlace venció. Desconecta y vuelve a pegar el token.':'Todavía no has conectado un bot.');
    if(!dirty){$('enabled').checked=s.enabled;$('urgent').checked=s.urgent;$('daily').value=s.dailyTime;$('quiet-start').value=s.quietStart;$('quiet-end').value=s.quietEnd;}}
  async function call(name,...args){const r=await api[name](...args);if(!r?.success)throw Error(r?.error||'No se pudo completar la acción.');return r.data;}
  async function refresh(){if(busy)return;try{render(await call('telegramState'));}catch(e){$('status').textContent=e.message;}}
  async function action(fn){if(busy)return;busy=true;$('status').textContent='Un momento…';panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){$('status').textContent=e.message;}finally{busy=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  panel.addEventListener('toggle',()=>{if(panel.open)refresh();});
  $('options').oninput=()=>dirty=true;
  $('botfather').onclick=()=>api.openExternal('https://t.me/BotFather');
  $('pair').onclick=()=>{if(state.pairUrl)api.openExternal(state.pairUrl);};
  $('connect').onclick=()=>action(async()=>{render(await call('telegramConfigure',$('token').value));$('token').value='';$('status').textContent='Bot registrado. Ahora vincula tu chat con el botón de arriba.';});
  $('disconnect').onclick=()=>action(async()=>{render(await call('telegramDisconnect'));dirty=false;$('status').textContent='Bot desconectado de Notip.';});
  $('test').onclick=()=>action(async()=>{await call('telegramTest');$('status').textContent='Prueba enviada a tu Telegram.';});
  $('options').onsubmit=e=>{e.preventDefault();action(async()=>{const s=await call('telegramSettings',{enabled:$('enabled').checked,urgent:$('urgent').checked,dailyTime:$('daily').value,quietStart:$('quiet-start').value,quietEnd:$('quiet-end').value});dirty=false;render(s);$('status').textContent='Horarios guardados.';});};
  setInterval(()=>{if(panel.open&&!document.getElementById('modal-settings').classList.contains('hidden'))refresh();},3000);
})();
