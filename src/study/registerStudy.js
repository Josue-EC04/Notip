'use strict';
const path = require('path');
const {StudyService,relatedNotes,recommendTask}=require('./studyService');
const {createStudyAI}=require('./studyAI');

module.exports=function registerStudy({app,ipcMain,BrowserWindow,store,vaultPath,dataPath,preload,icon,onLocalLogin,onTasksChanged,onNotesChanged,aiAdapter=null}) {
  const db=require('../db/database');
  const notes=require('../notes/notesManager');
  let win=null, service=null, timer=null, suspended=true;
  const getKey=()=>store.get('anthropic_custom_key')||process.env.ANTHROPIC_API_KEY||'';
  const broadcast=(channel,data)=>BrowserWindow.getAllWindows().forEach(w=>{if(!w.isDestroyed()) w.webContents.send(channel,data);});
  function show(tab='inbox') {
    if(!win||win.isDestroyed()) {
      win=new BrowserWindow({width:1050,height:760,minWidth:720,minHeight:550,title:'Notip — Estudio',icon,backgroundColor:'#F7F5EF',show:false,webPreferences:{preload,contextIsolation:true,nodeIntegration:false}});
      win.setMenuBarVisibility(false);
      win.loadFile(path.join(__dirname,'study.html'));
      win.once('ready-to-show',()=>{win.show();win.webContents.send('study-tab',tab);});
      win.on('closed',()=>{win=null;});
    } else {win.show();win.focus();win.webContents.send('study-tab',tab);}
  }
  function wake(force=false) {if(service&&!suspended) service.process(force).catch(err=>console.error('[study]',err.message));}
  const safe=fn=>async(_e,...args)=>{try {if(!service) throw Error('El almacenamiento local todavía no está listo.');return {success:true,data:await fn(...args)};}catch(err){return {success:false,error:err.message};}};
  ipcMain.on('open-study',(_e,tab)=>show(['inbox','classes','focus'].includes(tab)?tab:'inbox'));
  ipcMain.handle('study-state',safe(()=>service.snapshot()));
  ipcMain.handle('study-capture',safe((text,type,context)=>{const e=service.capture(text,type,service.state.activeSessionId?null:context);onNotesChanged();setImmediate(wake);return e;}));
  ipcMain.handle('study-edit',safe((id,text)=>{const e=service.edit(id,text);wake();onNotesChanged();return e;}));
  ipcMain.handle('study-delete',safe(id=>{service.remove(id);onNotesChanged();}));
  ipcMain.handle('study-manual',safe((id,type)=>service.manual(id,type)));
  ipcMain.handle('study-retry',safe(()=>{wake(true);return service.snapshot();}));
  ipcMain.handle('study-pause',safe(paused=>{service.pause(paused);if(!paused) wake(true);return service.snapshot();}));
  ipcMain.handle('study-start-class',safe(name=>service.startSession(name)));
  ipcMain.handle('study-end-class',safe(()=>{const s=service.endSession();wake();return s;}));
  ipcMain.handle('study-recommend',safe(minutes=>recommendTask(db.getTasks(),minutes)));
  ipcMain.handle('study-related',safe((text,filename)=>relatedNotes(String(text).slice(0,20000),notes.getAllNotes(vaultPath),filename)));
  ipcMain.handle('study-connect',safe((id,target)=>{
    const e=service.entry(id);const n=notes.getAllNotes(vaultPath).find(n=>n.filename===target);
    if(!n||n.filename===e.filename) throw Error('Esta nota ya no está disponible.');
    if(e.status!=='done') throw Error('Organiza primero esta captura.');
    const source=path.join(vaultPath,e.filename);
    if(!notes.addConnectionToNote(source,n.titulo||n.filename)) throw Error('No se pudo guardar la conexión.');
    onNotesChanged();return true;
  }));
  ipcMain.handle('study-task-effort',safe((id,minutes,step)=>{
    if(![5,15,30,60].includes(Number(minutes))) throw Error('Selecciona una duración válida.');
    const task=db.updateTask(Number(id),{duracion_min:Number(minutes),primer_paso:String(step||'').slice(0,500)});
    if(!task) throw Error('La tarea ya no existe.');onTasksChanged();return task;
  }));
  ipcMain.handle('auth-local',async()=>{store.set('local_mode',true);onLocalLogin();show();return {success:true};});
  ipcMain.on('study-online',()=>wake(true));
  return {
    init(){
      const ai=aiAdapter||createStudyAI(getKey);
      service=new StudyService({dataPath,vaultPath,db,...ai,getNotes:()=>notes.getAllNotes(vaultPath),canProcess:()=>Boolean(getKey()||aiAdapter),onChange:s=>broadcast('study-updated',s),onSaved:e=>{
        onTasksChanged();onNotesChanged();broadcast('study-organized',e);
        // Existing cloud integration remains optional; offline data is always local first.
        try {const sync=require('../sync/syncManager');const note=notes.getNoteByPath(path.join(vaultPath,e.filename));if(note) sync.uploadNote(note).catch(()=>{});if(e.taskId){const task=db.getTasks().find(t=>t.id===e.taskId);if(task) sync.uploadTask(task).catch(()=>{});}}catch(_){}
      }});
      timer=setInterval(()=>wake(),30000);timer.unref();
    },
    show,wake,
    capture(text,type,context){
      if(!service)throw Error('El almacenamiento local todavía no está listo.');
      const e=service.capture(text,type,context);onNotesChanged();setImmediate(wake);
      return {success:true,pending:true,classified:false,tipo:type||'sin_clasificar',titulo:text.slice(0,70),filename:e.filename,filePath:path.join(vaultPath,e.filename),mensaje_feedback:'Guardado en este equipo. Pendiente de organizar con IA.'};
    },
    editPendingNote(filename,fields){
      const e=service?.state.entries.find(e=>e.filename===filename&&e.status!=='done');if(!e)return null;
      const updated=service.edit(e.id,fields.content!==undefined?fields.content:e.text);
      updated.overrides={...updated.overrides};
      if(fields.titulo!==undefined)updated.overrides.titulo_corto=String(fields.titulo).slice(0,150);
      if(['nota','idea','tarea'].includes(fields.tipo)){updated.forcedType=fields.tipo;updated.overrides.tipo=fields.tipo;}
      if(Array.isArray(fields.tags))updated.overrides.tags=fields.tags.filter(t=>typeof t==='string');
      service.change();service.mirror(updated);wake();return {success:true,filePath:path.join(vaultPath,filename)};
    },
    deletePendingNote(filename){const e=service?.state.entries.find(e=>e.filename===filename&&e.status!=='done');if(!e)return false;service.remove(e.id);return true;},
    resume(){suspended=false;setTimeout(()=>wake(),500).unref();},
    stop(){suspended=true;if(service){service.generation++;}if(win&&!win.isDestroyed())win.destroy();},
  };
};
