const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const {StudyService,relatedNotes,recommendTask,validateClassification}=require('../src/study/studyService');
const {localDate}=require('../src/study/studyAI');
const {getAllNotes}=require('../src/notes/notesManager');
const result=(text='Organizado')=>({tipo:'nota',titulo_corto:'Concepto de redes',texto_reescrito:text,tags:['redes'],fecha_entrega:null});
function fixture(t,extra={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'notip-study-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let tasks=[];let seq=0;
  const db={getTasks:()=>tasks,addTask:data=>{const task={...data,id:++seq};tasks.push(task);return task;},updateTask:(id,data)=>{const task=tasks.find(x=>x.id===id);Object.assign(task,data);return task;}};
  const opts={dataPath:path.join(root,'data'),vaultPath:path.join(root,'vault'),db,classify:async text=>result(text),summarize:async()=>({resumen:'Resumen de lo capturado',conceptos:['Redes'],dudas:[],preguntas:['¿Qué aprendiste?']}),getNotes:()=>getAllNotes(path.join(root,'vault')),...extra};
  return {service:new StudyService(opts),opts,root,db};
}
test('offline capture persists original and pending Markdown across restarts',async t=>{
  const {service,opts}=fixture(t,{classify:async()=>{throw Error('Sin conexión');}});const e=service.capture('Resolver ejercicios de redes mañana');
  await service.process();assert.equal(service.entry(e.id).status,'error');
  const recovered=new StudyService(opts);assert.equal(recovered.entry(e.id).original,e.text);assert.equal(getAllNotes(opts.vaultPath)[0].estado,'pendiente_clasificacion');
});
test('reconnection classifies once and keeps stable origin, original and date',async t=>{
  const {service,db,opts}=fixture(t,{classify:async text=>({...result(text),tipo:'tarea'})});const e=service.capture('Entregar práctica');
  await service.process();await service.process(true);assert.equal(db.getTasks().length,1);assert.equal(db.getTasks()[0].nota_origen,e.filename);
  const note=getAllNotes(opts.vaultPath)[0];assert.equal(note.texto_original,e.text);assert.equal(note.creado,e.created);assert.equal(note.clasificado_con_ia,true);
});
test('edit during an AI request discards stale response and processes newest revision',async t=>{
  let resolve;let calls=0;
  const {service}=fixture(t,{classify:text=>++calls===1?new Promise(r=>resolve=r):Promise.resolve(result(text))});const e=service.capture('Versión vieja');
  const running=service.process();service.edit(e.id,'Versión nueva');resolve(result('Resultado viejo'));await running;
  assert.equal(service.entry(e.id).status,'pending');await service.process();assert.equal(service.entry(e.id).result.texto_reescrito,'Versión nueva');assert.equal(service.entry(e.id).original,'Versión vieja');
});
test('delete during AI request cannot recreate the capture',async t=>{
  let resolve;const {service,opts}=fixture(t,{classify:()=>new Promise(r=>resolve=r)});const e=service.capture('Eliminar antes de respuesta');const running=service.process();service.remove(e.id);resolve(result());await running;assert.equal(service.snapshot().entries.length,0);assert.equal(getAllNotes(opts.vaultPath).length,0);
});
test('manual task stays manual when old AI response arrives',async t=>{
  let resolve;const {service,db}=fixture(t,{classify:()=>new Promise(r=>resolve=r)});const e=service.capture('Hacer práctica');const running=service.process();service.manual(e.id,'tarea');resolve(result());await running;
  assert.equal(service.entry(e.id).source,'manual');assert.equal(db.getTasks().length,1);assert.equal(service.entry(e.id).result.tipo,'tarea');
});
test('manual task works with no key and restarts without reclassification',async t=>{
  const {service,opts,db}=fixture(t,{canProcess:()=>false});const e=service.capture('Leer apuntes');service.manual(e.id,'tarea');await service.process();assert.equal(db.getTasks().length,1);
  assert.equal(new StudyService(opts).entry(e.id).status,'done');assert.equal(getAllNotes(opts.vaultPath)[0].clasificado_con_ia,false);
});
test('classes collect captures, wait for organization, and summarize once',async t=>{
  let summarized=0;const {service}=fixture(t,{summarize:async(s,entries)=>{summarized++;assert.equal(s.name,'Redes');assert.equal(entries.length,2);return {resumen:'Subnetting',conceptos:['Máscara'],dudas:['¿Qué es /27?'],preguntas:['¿Cómo divides una red?']};}});
  const s=service.startSession('Redes');const a=service.capture('Duda sobre máscara');service.capture('Entregar práctica');service.endSession();await service.process();
  assert.equal(service.entry(a.id).sessionId,s.id);assert.equal(service.snapshot().sessions[0].report.resumen,'Subnetting');await service.process();assert.equal(summarized,1);
});
test('active class and pending summary survive offline restart',async t=>{
  const {service,opts}=fixture(t,{canProcess:()=>false});const s=service.startSession('Cálculo');service.capture('Duda de integrales');const restored=new StudyService(opts);assert.equal(restored.snapshot().activeSessionId,s.id);restored.endSession();await restored.process();assert.equal(restored.snapshot().sessions[0].status,'pending');
});
test('retry reuses task identity after partial write failure',async t=>{
  const {service,db}=fixture(t,{classify:async()=>({...result(),tipo:'tarea'})});const e=service.capture('Entregar informe');const original=service.mirror.bind(service);let fail=true;
  service.mirror=(entry)=>{if(entry.status==='done'&&fail){fail=false;throw Error('Disco temporalmente bloqueado');}return original(entry);};await service.process();assert.equal(service.entry(e.id).status,'error');assert.equal(db.getTasks().length,1);await service.process(true);assert.equal(service.entry(e.id).status,'done');assert.equal(db.getTasks().length,1);
});
test('pausing invalidates in-flight response without losing capture',async t=>{
  let resolve;const {service}=fixture(t,{classify:()=>new Promise(r=>resolve=r)});const e=service.capture('Mantener pendiente');const running=service.process();service.pause(true);resolve(result());await running;assert.equal(service.entry(e.id).status,'pending');
});
test('modification keeps prior Markdown identity and task identity',async t=>{
  const {service,db,opts}=fixture(t,{classify:async text=>({...result(text),tipo:'tarea',es_modificacion_de_anterior:text.startsWith('Cambia')})});const a=service.capture('Reunión de redes');await service.process();const old=service.entry(a.id);
  const b=service.capture('Cambia la hora',null,{filePath:old.filePath,taskId:old.taskId});await service.process();assert.equal(service.entry(b.id).filename,a.filename);assert.equal(db.getTasks().length,1);assert.equal(getAllNotes(opts.vaultPath).length,1);
});
test('related suggestions reject generic terms and explain at most two matches',()=>{
  const notes=[{filename:'a.md',titulo:'Proyecto de redes',content:'Subnetting máscara de redes'},{filename:'b.md',titulo:'Comprar leche',content:'Nueva tarea'},{filename:'c.md',titulo:'Máscara redes',content:'Subnetting práctica'},{filename:'d.md',titulo:'Máscara subnetting',content:'Redes'}];
  const related=relatedNotes('Duda redes máscara subnetting',notes,'a.md');assert.equal(related.length,2);assert.ok(related.every(n=>n.filename!=='a.md'&&n.filename!=='b.md'&&n.reason.includes('Comparten:')));
  assert.deepEqual(relatedNotes('Nueva tarea para hoy',notes),[]);
});

test('failed continuation restores raw filename so manual save cannot overwrite prior note',async t=>{
  const {service,db,opts}=fixture(t,{classify:async text=>({...result(text),tipo:'tarea',es_modificacion_de_anterior:text==='Cambiar hora'})});
  const first=service.capture('Entrega original');await service.process();
  const next=service.capture('Cambiar hora',null,{filePath:service.entry(first.id).filePath});
  const update=db.updateTask;db.updateTask=()=>{throw Error('Disco no disponible');};
  await service.process();assert.equal(service.entry(next.id).filename,next.filename);
  db.updateTask=update;service.manual(next.id,'nota');
  assert.equal(getAllNotes(opts.vaultPath).length,2);
  assert.match(fs.readFileSync(path.join(opts.vaultPath,first.filename),'utf8'),/Entrega original/);
});

test('invalid calendar date and empty AI response remain safe',async t=>{
  assert.equal(validateClassification({...result(),fecha_entrega:'2026-02-30'},'texto').fecha_entrega,null);
  const {service}=fixture(t,{classify:async()=>null});const e=service.capture('Texto sin respuesta');
  await service.process();assert.equal(service.entry(e.id).status,'error');assert.equal(service.entry(e.id).text,e.text);
});
test('15 minute recommendation excludes completed tasks and respects urgency and custom steps',()=>{
  const tasks=[{id:1,titulo:'Finalizada',estado:'hecho',prioridad:'alta'},{id:2,titulo:'Leer apuntes',duracion_min:15},{id:3,titulo:'Entregar informe',fecha_entrega:'2026-09-12',duracion_min:60,primer_paso:'Escribir introducción'}];const r=recommendTask(tasks,15,new Date('2026-09-12T10:00:00'));
  assert.equal(r.task.id,3);assert.equal(r.partial,true);assert.equal(r.step,'Escribir introducción');assert.equal(recommendTask([]),null);
});
test('AI schema sanitizes invalid values and reference date is capture date',()=>{
  const r=validateClassification({...result(),hora_entrega:'18:99',tags:[1,'redes'],tipo:'inventado'},'texto');assert.equal(r.hora_entrega,null);assert.deepEqual(r.tags,['redes']);assert.equal(r.tipo,'nota');assert.equal(localDate('2026-09-10T12:00:00'),'2026-09-10');assert.throws(()=>validateClassification({error_clasificacion:true},'texto'));
});
test('real SQLite stores effort and reloads it',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'notip-study-sql-'));const db=require('../src/db/database');
  t.after(()=>{db.closeDatabase();fs.rmSync(root,{recursive:true,force:true});});await db.initDatabase(root);const task=db.addTask({titulo:'Leer Redes'});db.updateTask(task.id,{duracion_min:15,primer_paso:'Leer un apartado'});db.closeDatabase();await db.initDatabase(root);
  assert.equal(db.getTasks()[0].duracion_min,15);assert.equal(db.getTasks()[0].primer_paso,'Leer un apartado');
});
