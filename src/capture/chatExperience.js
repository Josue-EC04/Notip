// Presentation only; storage and classification remain in the existing service.
(() => {
  const get = id => document.getElementById(id);
  const more = get('more-menu');
  const toggle = get('btn-more');
  function closeMenu() { more.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  toggle.onclick = () => { more.hidden = !more.hidden; toggle.setAttribute('aria-expanded', String(!more.hidden)); };
  more.addEventListener('click', event => { if (event.target.closest('button')) closeMenu(); });
  document.addEventListener('click', event => { if (!more.contains(event.target) && !toggle.contains(event.target)) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !more.hidden) { closeMenu(); toggle.focus(); event.stopPropagation(); } }, true);
  get('btn-notes').onclick = () => window.electronAPI.openCanvas();
  get('capture-kind').onchange = event => { forcedType = event.target.value || null; };
  function fitInput() {
    input.style.setProperty('height', 'auto', 'important');
    input.style.setProperty('height', Math.min(108, Math.max(44, input.scrollHeight)) + 'px', 'important');
    charCounter.hidden = input.value.length < 850;
  }
  input.addEventListener('input', fitInput);
  fitInput();
  document.querySelectorAll('.quick-chip').forEach(button => button.addEventListener('click', () => input.dispatchEvent(new Event('input'))));
  const welcome = get('welcome-card');
  welcome.hidden = localStorage.getItem('notip_welcome_seen') === '1';
  get('dismiss-welcome').onclick = () => { welcome.hidden = true; localStorage.setItem('notip_welcome_seen', '1'); };
  get('btn-help').onclick = () => {
    welcome.hidden = false;
    get('close-chat-tools').click();
    welcome.scrollIntoView({ block: 'nearest' });
  };
  get('class-ribbon-open').onclick = () => window.electronAPI.openStudy('classes');
  get('class-ribbon-end').onclick = async () => {
    get('class-ribbon-end').disabled = true;
    try {
      const result = await window.electronAPI.studyEndClass();
      if (!result.success) throw Error(result.error);
      window.electronAPI.openStudy('classes');
    } catch (error) { showToast(error.message, true); }
    finally { get('class-ribbon-end').disabled = false; }
  };
  function updateClass(state) {
    const session = state.sessions.find(s => s.id === state.activeSessionId);
    get('class-ribbon').hidden = !session;
    if (session) {
      const count = state.entries.filter(e => e.sessionId === session.id).length;
      get('class-ribbon-open').textContent = `En clase: ${session.name} · ${count} apuntes`;
    }
    // The contextual ribbon already identifies the current class.
    get('btn-study-class').textContent = session ? 'Mis clases' : 'Iniciar clase';
  }
  window.electronAPI.on('study-updated', updateClass);
  window.electronAPI.studyState().then(result => { if (result.success) updateClass(result.data); });
  get('focus-ribbon').onclick = () => window.electronAPI.openStudy('focus');
  function updateTimer() {
    let session;
    try { session = JSON.parse(localStorage.getItem('notip_focus_session') || 'null'); } catch (_) {}
    get('focus-ribbon').hidden = !session;
    if (!session) return;
    const left = Math.max(0, Math.ceil((session.endsAt - Date.now()) / 1000));
    get('focus-ribbon').textContent = left ? `Enfoque · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} restantes · Ver bloque` : 'Bloque terminado · Revisar avance';
  }
  setInterval(updateTimer, 1000);
  updateTimer();
})();
