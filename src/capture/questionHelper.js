(() => {
  const get = id => document.getElementById(id);
  const dialog = get('question-dialog');
  const prompt = get('question-prompt');
  const provider = get('question-provider');
  const names = { claude: 'Claude', gemini: 'Gemini', chatgpt: 'ChatGPT' };
  let busy = false;
  let lastSource = null;
  let revision=0;
  prompt.addEventListener('input',()=>revision++);
  get('question-improve').onclick=async()=>{
    if(busy||!prompt.value.trim())return;
    busy=true;const version=revision,original=prompt.value;
    get('question-improve').disabled=true;
    get('question-status').textContent='Claude está redactando tu consulta…';
    try{
      const r=await window.electronAPI.studyImproveQuestion(original);
      if(version!==revision||prompt.value!==original)return;
      if(!r.success)throw Error(r.error);
      prompt.value=r.data;revision++;
      get('question-status').textContent='Consulta mejorada con Claude. Revísala antes de copiar.';
    }catch(e){if(version===revision)get('question-status').textContent=(e.message||'No se pudo conectar con Claude.')+' Tu consulta original se conserva.';}
    finally{busy=false;get('question-improve').disabled=false;}
  };
  try {
    const saved = localStorage.getItem('notip_question_provider');
    if (Object.hasOwn(names, saved)) provider.value = saved;
  } catch (_) {}
  function updateLabel() { get('question-open').textContent = `Copiar y abrir ${names[provider.value]}`; }
  provider.onchange = () => {
    updateLabel();
    try { localStorage.setItem('notip_question_provider', provider.value); } catch (_) {}
  };
  updateLabel();
  window.addEventListener('resolve-question', event => {
    const {text, title, course, mode} = event.detail;
    const source = JSON.stringify(event.detail);
    if (source !== lastSource) {
      revision++;
      prompt.value = [
        'Actúa como un tutor paciente. Ayúdame a entender la duda de este apunte.',
        course ? `Estoy estudiando: ${course}.` : '',
        title ? `Tema: ${title}.` : '',
        '\nMi apunte o duda:', text,
        '\nExplícalo paso a paso, con un ejemplo sencillo. Si falta información, pregúntame antes de asumir. Señala si mi apunte contiene errores y termina con una pregunta corta para comprobar que lo entendí.',
      ].filter(Boolean).join('\n').slice(0,24000);
      if(mode==='review')prompt.value=`Ayúdame a repasar esta clase como tutor. Usa los apuntes como contexto, señala posibles errores y hazme una pregunta a la vez. Espera mi respuesta, dame una explicación breve y adapta la siguiente pregunta. No inventes lo que vimos en clase.\nClase: ${course||title}\n\n${text}`.slice(0,24000);
      lastSource = source;
    }
    get('question-title').textContent=mode==='review'?'Repasar esta clase':'Resolver esta duda';
    get('question-status').textContent = '';
    if (!dialog.open) dialog.showModal();
    prompt.focus();
  });
  get('question-close').onclick = () => dialog.close();
  async function transfer(open) {
    if (busy) return;
    if (!prompt.value.trim()) { get('question-status').textContent = 'Escribe tu consulta antes de copiarla.'; prompt.focus(); return; }
    busy = true;
    get('question-status').textContent = '';
    get('question-open').disabled = get('question-copy').disabled = true;
    try {
      const result = await window.electronAPI.externalQuestion(prompt.value, open ? provider.value : null);
      get('question-status').textContent = result.success
        ? open ? 'Consulta copiada. En el navegador, pega con Ctrl+V y envía cuando estés listo.' : 'Consulta copiada. Puedes pegarla en el chat que prefieras.'
        : result.error || 'No se pudo completar la acción. Tu consulta sigue aquí.';
    } catch (_) { get('question-status').textContent = 'No se pudo completar la acción. Tu consulta sigue aquí para copiarla manualmente.'; }
    finally { busy = false; get('question-open').disabled = get('question-copy').disabled = false; }
  }
  get('question-copy').onclick = () => transfer(false);
  get('question-form').onsubmit = event => { event.preventDefault(); transfer(true); };
})();
