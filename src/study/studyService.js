'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const matter = require('gray-matter');

const STOP = new Set('para como esto esta este una unas unos los las del con por que tengo hacer crear nueva nuevo nota idea tarea clase hoy mañana sobre desde pero muy puede quiero apuntes'.split(' '));
function terms(text) {
  return [...new Set(String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{4,}/g) || [])].filter(t => !STOP.has(t));
}
function relatedNotes(text, notes, excluded) {
  const wanted = new Set(terms(text));
  return notes.filter(n => n.filename !== excluded && n.estado !== 'pendiente_clasificacion').map(n => {
    const hits = terms(`${n.titulo || ''} ${n.content || ''} ${(Array.isArray(n.tags) ? n.tags : []).join(' ')}`).filter(t => wanted.has(t));
    return { filename: n.filename, titulo: n.titulo || n.filename, preview: (n.content || '').slice(0, 220), reason: `Comparten: ${hits.slice(0, 3).join(', ')}`, score: hits.length };
  }).filter(n => n.score >= 2).sort((a,b) => b.score - a.score || a.filename.localeCompare(b.filename)).slice(0,2);
}
function recommendTask(tasks, minutes = 15, now = new Date()) {
  minutes = [5,15,30,60].includes(Number(minutes)) ? Number(minutes) : 15;
  const candidates = tasks.filter(t => t.estado !== 'hecho').map(t => {
    const estimated = Number(t.duracion_min) || 30;
    const deadline = t.fecha_entrega ? new Date(`${t.fecha_entrega}T${t.hora_entrega || '23:59'}:00`) : null;
    const days = deadline && Number.isFinite(+deadline) ? (+deadline - +now) / 86400000 : null;
    const score = (days !== null && days < 0 ? 100 : days !== null && days <= 1 ? 80 : days !== null && days <= 3 ? 50 : 0) + ({alta:30,media:15}[t.prioridad] || 0) + (estimated <= minutes ? 25 : 0) + (['progreso','en_progreso'].includes(t.estado) ? 5 : 0);
    let step = t.primer_paso;
    if (!step) {
      const text = `${t.titulo} ${t.descripcion || ''}`.toLowerCase();
      step = /examen|estudi|repas/.test(text) ? 'Abre tus apuntes, elige un concepto y explícalo sin mirar. Anota la duda que quede.' : /informe|escrib|entreg/.test(text) ? 'Abre el documento y escribe los tres apartados que necesitas desarrollar. Empieza por uno.' : /program|proyecto|app|codigo|código/.test(text) ? 'Elige una parte pequeña, escribe qué debería hacer y completa el primer cambio comprobable.' : 'Prepara lo necesario y completa el primer paso concreto. Anota qué queda al terminar.';
    }
    return { task:t, minutes, estimated, partial:estimated > minutes, step, score, reason: days !== null && days < 0 ? 'La fecha de entrega ya pasó.' : days !== null && days <= 1 ? 'Vence en las próximas 24 horas.' : t.prioridad === 'alta' ? 'Tiene prioridad alta.' : estimated <= minutes ? 'Su duración estimada cabe en este tiempo.' : 'Puedes avanzar una parte sin terminar todo ahora.' };
  }).sort((a,b) => b.score-a.score || a.task.id-b.task.id);
  return candidates[0] || null;
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const tmp = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(tmp, content, 'utf8'); fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function validateClassification(r, text, forcedType) {
  if (!r || r.error_clasificacion || r.usando_fallback_local) throw new Error('La IA no devolvió una clasificación válida. Tu texto sigue guardado.');
  const date = typeof r.fecha_entrega === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_entrega) && !isNaN(Date.parse(r.fecha_entrega)) && new Date(r.fecha_entrega).toISOString().slice(0,10) === r.fecha_entrega ? r.fecha_entrega : null;
  return { ...r, tipo: ['tarea','idea','nota'].includes(forcedType) ? forcedType : ['tarea','idea','nota'].includes(r.tipo) ? r.tipo : 'nota', titulo_corto: typeof r.titulo_corto === 'string' ? r.titulo_corto.slice(0,150) : text.slice(0,70), texto_reescrito: typeof r.texto_reescrito === 'string' ? r.texto_reescrito : text, descripcion: typeof r.descripcion === 'string' ? r.descripcion : null, curso: typeof r.curso === 'string' ? r.curso : null, fecha_entrega:date, hora_entrega:typeof r.hora_entrega === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora_entrega) ? r.hora_entrega : null, prioridad:['alta','media','normal'].includes(r.prioridad) ? r.prioridad : 'normal', tags:Array.isArray(r.tags) ? r.tags.filter(t => typeof t === 'string').slice(0,8) : [], conexiones_sugeridas:Array.isArray(r.conexiones_sugeridas) ? r.conexiones_sugeridas.filter(t=> typeof t==='string').slice(0,5) : [] };
}

class StudyService {
  constructor({ dataPath, vaultPath, db, classify, summarize, getNotes, onChange = () => {}, onSaved = () => {}, canProcess = () => true }) {
    this.file = path.join(dataPath, 'study.json'); this.vault = vaultPath;
    this.db=db; this.classify=classify; this.summarize=summarize; this.getNotes=getNotes; this.onChange=onChange; this.onSaved=onSaved; this.canProcess=canProcess;
    this.state=fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file,'utf8')) : {entries:[],sessions:[],activeSessionId:null,paused:false};
    for (const e of [...this.state.entries,...this.state.sessions]) if(e.status==='processing') e.status='pending';
    this.processing=false; this.connection='unknown'; this.generation=0; this.commit();
  }
  commit() { atomicWrite(this.file, JSON.stringify(this.state,null,2)); }
  change() { this.commit(); this.onChange(this.snapshot()); }
  snapshot() { return JSON.parse(JSON.stringify({...this.state,connection:this.connection,processing:this.processing, configured:this.canProcess()})); }
  entry(id) { const e=this.state.entries.find(x=>x.id===id); if(!e) throw Error('La captura ya no existe.'); return e; }
  capture(text, forcedType=null, context=null, sessionId=undefined) {
    if(typeof text!=='string' || !text.trim() || text.length>20000) throw Error('Escribe entre 1 y 20 000 caracteres.');
    text=text.trim();
    const sid=sessionId===undefined ? this.state.activeSessionId : sessionId;
    if(sid && !this.state.sessions.some(s=>s.id===sid && !s.ended)) throw Error('La clase ya terminó.');
    const e={id:randomUUID(),text,original:text,forcedType:['nota','idea','tarea'].includes(forcedType)?forcedType:null,context:context || null,sessionId:sid||null,created:new Date().toISOString(),revision:1,status:'pending',attempts:0,nextRetry:0};
    e.filename=`captura_${e.id}.md`; this.state.entries.push(e); this.change();
    try { this.mirror(e); } catch(err) { e.error='El texto está en la bandeja; falta escribir su copia Markdown.'; this.change(); }
    return {...e};
  }
  mirror(e) {
    const r=e.result || (e.overrides ? {...e.overrides,texto_reescrito:e.text} : null);
    const target=path.join(this.vault,e.filename);
    const prior=fs.existsSync(target)?matter(fs.readFileSync(target,'utf8')).data:{};
    atomicWrite(target,matter.stringify(r?.texto_reescrito || e.text,{...prior,tipo:r?.tipo||'sin_clasificar',titulo:r?.titulo_corto||e.text.slice(0,70),estado:e.status==='done'?'clasificado':'pendiente_clasificacion',creado:prior.creado||e.created,fecha:prior.fecha||e.created.slice(0,10),tags:r?.tags||[],prioridad:r?.prioridad||'normal',conexiones_sugeridas:r?.conexiones_sugeridas||[],clasificado_con_ia:e.source==='ia',captura_id:e.id,clase_id:e.sessionId,texto_original:prior.texto_original||e.original,texto_capturado:e.text}));
  }
  edit(id, text) {
    const e=this.entry(id); if(e.status==='done') throw Error('Esta captura ya fue organizada. Edítala desde tus notas.');
    if(typeof text!=='string'||!text.trim()||text.length>20000) throw Error('Texto no válido.');
    e.text=text.trim(); e.revision++; e.status='pending'; e.nextRetry=0; e.error=null; this.change(); this.mirror(e); return e;
  }
  remove(id) {
    const e=this.entry(id); if(e.status==='done') throw Error('Elimina las notas organizadas desde el cerebro o la pizarra.');
    const target=path.join(this.vault,e.filename); if(fs.existsSync(target)) fs.unlinkSync(target);
    this.state.entries=this.state.entries.filter(x=>x.id!==id); this.change();
  }
  finish(e,r,source='ia') {
    const rawFilename=e.filename;
    const previous={filename:e.filename,filePath:e.filePath,status:e.status,result:e.result,source:e.source};
    try {
    if(r.es_modificacion_de_anterior===true && e.context?.filePath) {
      const target=path.resolve(e.context.filePath);
      if(path.dirname(target)!==path.resolve(this.vault)||!target.endsWith('.md')||!fs.existsSync(target)) throw Error('La nota anterior ya no existe. Tu modificación está guardada; puedes organizarla manualmente como otra nota.');
      e.filename=path.basename(target);
    }
    // Identity by permanent Markdown filename makes retries safe after interrupted writes.
    const existing=this.db.getTasks('todas').find(t=>t.nota_origen===e.filename);
    if(r.tipo==='tarea') {
      const data={titulo:r.titulo_corto,descripcion:r.descripcion||r.texto_reescrito,curso:r.curso,fecha_entrega:r.fecha_entrega,hora_entrega:r.hora_entrega,prioridad:r.prioridad,fecha_creacion:e.created,nota_origen:e.filename};
      const task=existing ? this.db.updateTask(existing.id,data) : this.db.addTask(data);
      e.taskId=existing?.id||task?.id;
      if(!e.taskId) throw Error('No se pudo guardar la tarea. La captura sigue pendiente.');
    }
    const result={...r};
    e.result=result;e.source=source;e.status='done';e.error=null;e.filePath=path.join(this.vault,e.filename);
    this.mirror(e);this.change();
    } catch(err) {Object.assign(e,previous);throw err;}
    if(rawFilename!==e.filename) {try{fs.unlinkSync(path.join(this.vault,rawFilename));}catch(_) {}}
    try {this.onSaved(e);} catch(_) {}
  }
  manual(id,tipo) {
    const e=this.entry(id);if(e.status==='done') return e;
    if(!['nota','idea','tarea'].includes(tipo)) throw Error('Selecciona un tipo válido.');
    e.revision++;
    this.finish(e,{titulo_corto:e.text.split('\n')[0].slice(0,100),texto_reescrito:e.text,tags:[],conexiones_sugeridas:[],prioridad:'normal',curso:this.state.sessions.find(s=>s.id===e.sessionId)?.name||null,...e.overrides,tipo},'manual'); return e;
  }
  startSession(name) {
    if(this.state.activeSessionId) throw Error('Termina tu clase actual antes de iniciar otra.');
    if(typeof name!=='string'||!name.trim()) throw Error('Escribe el nombre de la clase.');
    const s={id:randomUUID(),name:name.trim().slice(0,100),created:new Date().toISOString(),status:'active',revision:1};
    this.state.sessions.unshift(s);this.state.activeSessionId=s.id;this.change();return s;
  }
  endSession() {
    const s=this.state.sessions.find(x=>x.id===this.state.activeSessionId);if(!s) throw Error('No hay una clase activa.');
    s.ended=new Date().toISOString();s.status='pending';this.state.activeSessionId=null;this.change();return s;
  }
  pause(paused) {this.state.paused=!!paused;this.generation++;this.change();}
  async process(force=false) {
    if(this.processing || this.state.paused || !this.canProcess()) return this.snapshot();
    this.processing=true; const generation=this.generation;
    try {
      const pending=this.state.entries.filter(e=>['pending','error'].includes(e.status) && (force||!e.nextRetry||e.nextRetry<=Date.now()));
      for(const e of pending) {
        if(this.state.paused||generation!==this.generation) break;
        const rev=e.revision;e.status='processing';this.change();
        try {
          const session=this.state.sessions.find(s=>s.id===e.sessionId);
          const raw=await this.classify(e.text,e.forcedType,e.context,this.getNotes(),{created:e.created,course:session?.name});
          if(!this.state.entries.includes(e)||e.revision!==rev) continue;
          if(this.state.paused||generation!==this.generation) {e.status='pending';this.change();break;}
          if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('La IA no devolvió una clasificación válida.');
          const r=validateClassification({...raw,...e.overrides},e.text,e.forcedType);if(session && !r.curso) r.curso=session.name;
          this.finish(e,r);this.connection='online';
        } catch(err) {
          if(!this.state.entries.includes(e)||e.revision!==rev) continue;
          e.status='error';e.attempts++;e.error=String(err.message||'No se pudo organizar.').slice(0,220);e.nextRetry=Date.now()+Math.min(300000,15000*2**Math.min(e.attempts,4));
          this.connection='unavailable';this.change();break;
        }
      }
      for(const s of this.state.sessions.filter(s=>['pending','error'].includes(s.status))) {
        if(this.state.paused||generation!==this.generation) break;
        const entries=this.state.entries.filter(e=>e.sessionId===s.id);
        if(entries.some(e=>e.status!=='done')||(!force&&s.nextRetry>Date.now())) continue;
        if(!entries.length) {s.report={resumen:'Esta clase no contiene capturas.',conceptos:[],dudas:[],preguntas:[]};s.status='done';this.change();continue;}
        s.status='processing';this.change();
        try {
          const report=await this.summarize(s,entries);
          if(this.state.paused||generation!==this.generation){s.status='pending';this.change();break;}
          if(!report||typeof report.resumen!=='string') throw Error('El resumen recibido no es válido.');
          s.report={resumen:report.resumen.slice(0,12000)};
          for(const key of ['conceptos','dudas','preguntas']) s.report[key]=Array.isArray(report[key])?report[key].filter(x=>typeof x==='string').slice(0,12):[];
          s.status='done';s.error=null;this.connection='online';this.change();
        }catch(err){s.status='error';s.error=String(err.message).slice(0,220);s.nextRetry=Date.now()+60000;this.change();break;}
      }
    } finally {this.processing=false;this.change();}
    return this.snapshot();
  }
}
module.exports={StudyService,relatedNotes,recommendTask,validateClassification,atomicWrite};
