// Real Electron renderer + preload + IPC + SQLite, with deterministic AI and temporary data.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');const temp=fs.mkdtempSync(path.join(os.tmpdir(),'notip-ui-'));
app.setPath('userData',temp);app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
let failures=[];let study;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function screenshot(win,name){await delay(250);await win.webContents.capturePage(undefined,{stayHidden:true});await delay(120);fs.writeFileSync(path.join(artifacts,name),(await win.webContents.capturePage(undefined,{stayHidden:true})).toPNG());}
async function until(win,condition){for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript(condition))return;await delay(40);}throw Error('Timed out: '+condition);}
async function run(){
 const db=require('../src/db/database');await db.initDatabase(path.join(temp,'data'));
 const syncPath=require.resolve('../src/sync/syncManager');require.cache[syncPath]={id:syncPath,filename:syncPath,loaded:true,exports:{uploadNote:async()=>null,uploadTask:async()=>null}};
 const broadcast=()=>BrowserWindow.getAllWindows().forEach(w=>w.webContents.send('board-tasks-updated'));
 const store={get:()=>'',set:()=>{}};
 study=require('../src/study/registerStudy')({app,ipcMain,BrowserWindow,store,vaultPath:path.join(temp,'vault'),dataPath:path.join(temp,'data'),preload:path.join(root,'preload.js'),icon:path.join(root,'src/assets/icon.png'),onLocalLogin(){},onOpen:tab=>win.webContents.send("study-tab",tab),onTasksChanged:broadcast,onNotesChanged(){},aiAdapter:{classify:async(text,type,context,notes,meta)=>({tipo:type||(/entregar/i.test(text)?'tarea':'nota'),titulo_corto:text.split('\n')[0].slice(0,70),texto_reescrito:text,curso:meta.course||null,tags:['redes','subnetting'],prioridad:'media'}),summarize:async()=>({resumen:'Revisamos máscaras de subred y división de redes.',conceptos:['Subnetting','Máscara /27'],dudas:['¿Cuántos equipos admite /27?'],preguntas:['¿Para qué sirve una máscara de red?']})}});
 study.init();
 ipcMain.handle('get-tasks',()=>db.getTasks());ipcMain.handle('update-task-state',(_e,id,state)=>{const r=db.updateTaskState(id,state);broadcast();return r;});
 ipcMain.handle('get-notes-count',()=>require('../src/notes/notesManager').getAllNotes(path.join(temp,'vault')).length);
 ipcMain.handle('get-settings',()=>({user:null,credits:null,customKey:'',hasCustomKey:false}));
 for(const channel of ['open-board','open-brain','open-canvas','close-capture'])ipcMain.on(channel,()=>{});
 const win=new BrowserWindow({width:440,height:560,show:false,webPreferences:{backgroundThrottling:false,preload:path.join(root,'preload.js'),contextIsolation:true,nodeIntegration:false}});
 win.webContents.on('console-message',(_event,level,message)=>{if(level>=3&&!message.includes('ERR_INTERNET')&&!message.includes('ERR_NAME'))failures.push(message);});
 await win.loadFile(path.join(root,'src/capture/capture.html'));
 await until(win,"document.querySelector('#inbox-list .empty') !== null");
 await win.webContents.executeJavaScript("document.getElementById('btn-study-inbox').click();document.getElementById('pause-ai').click()");
 await until(win,"document.getElementById('pause-ai').textContent.includes('Reanudar')");
 await win.webContents.executeJavaScript("document.getElementById('note-input').value='Duda sobre subnetting y máscara /27';document.getElementById('note-input').dispatchEvent(new Event('input'));document.getElementById('btn-save').click()");
 await until(win,"document.querySelectorAll('#inbox-list .card').length===1");
 assert.match(await win.webContents.executeJavaScript("document.querySelector('#inbox-list').textContent"),/Duda sobre subnetting/);
 await win.webContents.executeJavaScript("document.querySelector('#inbox-list .actions button').click();document.getElementById('edit-text').value='Subnetting y máscara /27: revisar cantidad de equipos';document.getElementById('edit-form').requestSubmit()");
 await until(win,"document.querySelector('#inbox-list').textContent.includes('revisar cantidad')");
 await screenshot(win,'01-bandeja.png');
 // Real compact capture window uses the same service and preload.
 const capture=new BrowserWindow({width:490,height:560,show:false,webPreferences:{backgroundThrottling:false,preload:path.join(root,'preload.js'),contextIsolation:true,nodeIntegration:false}});
 capture.webContents.on('console-message',(_event,level,message)=>{if(level>=3&&!message.includes('ERR_'))failures.push(message);});
 await capture.loadFile(path.join(root,'src/capture/capture.html'));
 await capture.webContents.executeJavaScript("document.getElementById('note-input').value='Entregar práctica de redes';document.getElementById('note-input').dispatchEvent(new Event('input'));document.getElementById('btn-save').click()");
 await until(win,"document.querySelectorAll('#inbox-list .card').length===2");
 await until(capture,"document.getElementById('chat-stream-messages').textContent.includes('Captura guardada')");
 await screenshot(capture,'02-captura.png');
 await win.webContents.executeJavaScript("document.getElementById('btn-study-class').click();document.getElementById('class-name').value='Redes · Subnetting';document.getElementById('class-form').requestSubmit()");
 await until(win,"document.getElementById('btn-study-class').textContent.includes('Redes')");
 for(const text of ['No entiendo cómo calcular equipos con máscara /27','Entregar ejercicios de subnetting']) {
  await win.webContents.executeJavaScript(`document.getElementById('note-input').value=${JSON.stringify(text)};document.getElementById('note-input').dispatchEvent(new Event('input'));document.getElementById('btn-save').click()`);await delay(100);
 }
 await win.webContents.executeJavaScript("document.getElementById('btn-study-class').click();Array.from(document.querySelectorAll('#active-class button')).find(b=>b.textContent.includes('Terminar')).click()");
 await until(win,"document.getElementById('class-list').textContent.includes('Redes')");
 study.resume();await win.webContents.executeJavaScript("document.getElementById('pause-ai').click()");
 await until(win,"document.getElementById('class-list').textContent.includes('Resumen listo')");
 await win.webContents.executeJavaScript("document.getElementById('btn-study-class').click()");await screenshot(win,'03-clase.png');
 assert.equal(db.getTasks().length,2);
 await win.webContents.executeJavaScript("document.getElementById('btn-study-focus').click()");await until(win,"document.querySelector('#effort-form')!==null");
 await win.webContents.executeJavaScript("document.getElementById('effort-minutes').value='15';document.getElementById('effort-step').value='Resolver el primer ejercicio /27';document.getElementById('effort-form').requestSubmit()");
 await until(win,"document.querySelector('.step').textContent.includes('Resolver el primer ejercicio')");
 await win.webContents.executeJavaScript("document.querySelector('#focus-actions .primary').click()");await until(win,"document.getElementById('focus-clock')!==null");
 await screenshot(win,'04-enfoque.png');
 await win.webContents.executeJavaScript("document.getElementById('btn-study-inbox').click();document.getElementById('show-done').checked=true;document.getElementById('show-done').dispatchEvent(new Event('change'))");
 await until(win,"document.querySelector('.related-item')!==null");
 await win.webContents.executeJavaScript("document.querySelector('.related-item button:last-child').click()");
 await until(win,"document.getElementById('message').textContent.includes('Conexión guardada')");
 assert.ok(require('../src/notes/notesManager').getAllNotes(path.join(temp,'vault')).some(n=>n.content.includes('[[')));
 win.setSize(440,560);await delay(200);
 assert.equal(await win.webContents.executeJavaScript("document.getElementById('chat-tools').scrollWidth<=document.getElementById('chat-tools').clientWidth"),true);
 await screenshot(win,'05-compacto.png');
 if(failures.length)throw Error(failures.join('\n'));
 console.log('UI PASS: offline capture, edit, compact capture IPC, class report, task effort, focus timer, related link, compact layout.');
 study.stop();for(const w of BrowserWindow.getAllWindows())w.destroy();db.closeDatabase();
}
app.whenReady().then(run).then(()=>app.exit(0)).catch(e=>{console.error(e.stack);app.exit(1);});
