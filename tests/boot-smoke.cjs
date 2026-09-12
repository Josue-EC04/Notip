// Loads production main.js. Only OS side effects and network services are substituted.
const electron=require('electron');const {app,ipcMain}=electron;
const fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
const {EventEmitter}=require('events');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'notip-boot-'));
process.env.NOTIP_DATA_PATH=temp;process.env.ANTHROPIC_API_KEY='';
app.setPath('userData',temp);app.setAsDefaultProtocolClient=()=>true;app.requestSingleInstanceLock=()=>true;
const windows=[];let errors=[];
class HiddenWindow extends electron.BrowserWindow {
 constructor(opts){super({...opts,show:false,webPreferences:{...opts.webPreferences,backgroundThrottling:false}});windows.push(this);this.webContents.on('console-message',(_e,level,message)=>{if(level>=3&&!message.includes('ERR_')&&/\/(capture|auth)\//.test(this.webContents.getURL()))errors.push(message);});}
 show(){} focus(){} showInactive(){}
}
class FakeTray{on(){}setToolTip(){}setContextMenu(){}destroy(){}}
const watcher=new EventEmitter();watcher.start=()=>{};watcher.stop=()=>{};
const load=Module._load;
Module._load=function(id,parent,isMain){
 if(parent?.filename===path.join(root,'main.js')) {
  if(id==='electron')return {...electron,BrowserWindow:HiddenWindow,Tray:FakeTray,globalShortcut:{register:()=>true,unregisterAll(){}}};
  if(id==='dotenv')return {config(){}};
  if(id==='./src/utils/fullscreenWatcher')return watcher;
  if(id==='./src/supabase/client')return {restoreOrRefreshSession:async()=>null,getStoredUser:()=>null,getStoredSession:()=>null,signOut:async()=>{}};
  if(id==='./src/sync/syncManager')return {syncAllLocalToCloud:async()=>{},getCredits:async()=>null};
 }
 return load.call(this,id,parent,isMain);
};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn){for(let i=0;i<120;i++){const r=await fn();if(r)return r;await delay(50);}throw Error('Timed out waiting for app state.');}
const timeout=setTimeout(()=>{console.error('BOOT TIMEOUT');app.exit(1);},20000);
require('../main.js');
app.whenReady().then(async()=>{
 const auth=await waitFor(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/auth/')));
 await waitFor(()=>auth.webContents.executeJavaScript("!!document.getElementById('btn-local')").catch(()=>false));
 await auth.webContents.executeJavaScript("document.getElementById('btn-local').click()");
 const study=await waitFor(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/capture/')));
 await waitFor(()=>study.webContents.executeJavaScript("!!document.querySelector('#inbox-list .empty')").catch(()=>false));
 const r=await study.webContents.executeJavaScript("window.electronAPI.studyCapture('Prueba offline desde main.js',null,null)");
 if(!r.success)throw Error(r.error);
 const state=await study.webContents.executeJavaScript('window.electronAPI.studyState()');
 if(state.data.entries.length!==1||state.data.entries[0].status!=='pending')throw Error('Capture missing');
 const capture=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/capture/'));
 if(!capture)throw Error('Capture window missing');
 if(windows.some(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/study/')))throw Error('Separate study window must not exist');
 await study.webContents.executeJavaScript("document.getElementById('btn-study-focus').click()");
 await waitFor(()=>study.webContents.executeJavaScript("!document.getElementById('chat-tools').hidden && !document.getElementById('focus-view').hidden"));
 const saved=JSON.parse(fs.readFileSync(path.join(temp,'data/study.json'),'utf8'));
 if(saved.entries[0].original!=='Prueba offline desde main.js')throw Error('Local persistence missing');
 const legacy=await study.webContents.executeJavaScript("window.electronAPI.saveNote('Nota desde pizarra', 'nota', null)");
 if(!legacy.success||!legacy.pending)throw Error('Legacy capture did not queue offline');
 await study.webContents.executeJavaScript(`window.electronAPI.updateNoteContent(${JSON.stringify(legacy.filename)}, {content:'Texto editado desde pizarra',titulo:'Mi titulo',tags:['redes']})`);
 const edited=JSON.parse(fs.readFileSync(path.join(temp,'data/study.json'),'utf8')).entries.find(e=>e.filename===legacy.filename);
 if(edited.text!=='Texto editado desde pizarra'||edited.overrides.titulo_corto!=='Mi titulo')throw Error('Legacy edit did not update pending capture');
 await study.webContents.executeJavaScript(`window.electronAPI.deleteNote(${JSON.stringify(legacy.filename)})`);
 if(JSON.parse(fs.readFileSync(path.join(temp,'data/study.json'),'utf8')).entries.some(e=>e.filename===legacy.filename))throw Error('Deleted note remained queued');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('BOOT PASS: production main, local entrance, all windows, IPC and offline persistence.');
 clearTimeout(timeout);app.quit();
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1);});
