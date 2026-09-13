(() => {
  const get = id => document.getElementById(id);
  const dialog = get('question-dialog');
  const prompt = get('question-prompt');
  const provider = get('question-provider');
  const names = { claude: 'Claude', gemini: 'Gemini', chatgpt: 'ChatGPT' };
  let busy = false;
  let lastSource = null;
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
    const {text, title, course} = event.detail;
    const source = JSON.stringify(event.detail);
    if (source !== lastSource) {
      prompt.value = [
        'Actúa como un tutor paciente. Ayúdame a entender la duda de este apunte.',
        course ? `Estoy estudiando: ${course}.` : '',
        title ? `Tema: ${title}.` : '',
        '\nMi apunte o duda:', text,
        '\nExplícalo paso a paso, con un ejemplo sencillo. Si falta información, pregúntame antes de asumir. Señala si mi apunte contiene errores y termina con una pregunta corta para comprobar que lo entendí.',
      ].filter(Boolean).join('\n').slice(0,24000);
      lastSource = source;
    }
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
