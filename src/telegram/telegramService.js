'use strict';
const {randomBytes}=require('crypto');
const defaults={enabled:true,dailyTime:'18:00',quietStart:'22:00',quietEnd:'08:00',urgent:true};
const timeRE=/^([01]\d|2[0-3]):[0-5]\d$/;
const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const clock=d=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
function quiet(d,s){const t=clock(d);return s.quietStart<s.quietEnd?t>=s.quietStart&&t<s.quietEnd:t>=s.quietStart||t<s.quietEnd;}
async function request(token,method,body,signal){
  let r;try{r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])});}catch(_){throw Error('Sin conexión con Telegram. Se reintentará automáticamente.');}
  const data=await r.json();if(!data.ok)throw Error(data.error_code===401?'Token de Telegram inválido.':data.error_code===409?'Este bot está conectado a otra instancia. Usa un bot exclusivo para este Notip.':'Telegram no pudo completar la acción. Se reintentará.');return data.result;
}
class TelegramService{
  constructor({store,db,getOwner,onTasksChanged=()=>{},transport=request,now=()=>new Date()}){Object.assign(this,{store,db,getOwner,onTasksChanged,transport,now});this.config=store.get('telegram')||{};this.running=false;this.generation=0;this.error='';this.controller=new AbortController();}
  save(){this.store.set('telegram',this.config);}
  owned(){return Boolean(this.config.owner&&this.getOwner()&&this.config.owner===this.getOwner());}
  state(){const c=this.owned()?this.config:{};return {...defaults,...c.settings,configured:!!c.token,linked:!!c.chatId,username:c.username||'',pairUrl:c.code&&c.expires>this.now().getTime()?`https://t.me/${c.username}?start=${c.code}`:null,error:this.owned()?this.error:''};}
  async configure(token){
    const owner=this.getOwner();if(!owner)throw Error('Inicia sesión en Notip primero.');
    token=String(token||'').trim();if(!/^\d+:[\w-]{20,}$/.test(token))throw Error('Pega el token completo que te dio BotFather.');
    const version=this.generation;
    const controller=new AbortController();const me=await this.transport(token,'getMe',{},controller.signal);
    const webhook=await this.transport(token,'getWebhookInfo',{},controller.signal);if(webhook.url)throw Error('Este bot ya usa un webhook. Crea otro bot exclusivo para Notip.');
    if(!me.is_bot||!/^\w+$/.test(me.username))throw Error('Telegram no devolvió un bot válido.');
    if(this.getOwner()!==owner||this.generation!==version)throw Error('La conexión se canceló. Vuelve a conectar el bot.');
    this.stop();this.config={token,owner,username:me.username,settings:{...defaults},code:randomBytes(16).toString('hex'),expires:this.now().getTime()+600000,offset:0,sent:{},snoozed:{}};this.save();this.error='';this.start();return this.state();
  }
  settings(input){if(!this.owned()||!this.config.token)throw Error('Conecta tu bot primero.');const s={...defaults,...this.config.settings};for(const k of ['dailyTime','quietStart','quietEnd']){if(!timeRE.test(input[k]))throw Error('Selecciona horarios válidos.');s[k]=input[k];}if(s.quietStart===s.quietEnd)throw Error('El inicio y el fin del descanso deben ser distintos.');s.enabled=!!input.enabled;s.urgent=!!input.urgent;this.config.settings=s;this.save();return this.state();}
  disconnect(){this.stop();this.controller=new AbortController();this.config={};this.save();return this.state();}
  start(){if(this.running||!this.config.token||!this.owned())return;this.running=true;this.controller=new AbortController();this.loop(this.controller);}
  stop(){this.generation++;this.running=false;this.controller.abort();clearTimeout(this.timer);}
  async call(method,body,controller=this.controller){if(!this.running||controller!==this.controller||controller.signal.aborted||!this.owned())throw Error('Telegram está detenido.');const result=await this.transport(this.config.token,method,body,controller.signal);if(controller.signal.aborted||controller!==this.controller||!this.owned())throw Error('Telegram está detenido.');return result;}
  async loop(controller){
    try{const updates=await this.call('getUpdates',{offset:this.config.offset||0,timeout:15,allowed_updates:['message','callback_query']},controller);for(const u of updates){await this.handle(u);this.config.offset=u.update_id+1;this.save();}await this.tick();this.error='';}catch(e){if(!controller.signal.aborted)this.error=e.message;}
    if(this.running&&controller===this.controller){this.timer=setTimeout(()=>this.loop(controller),this.error?30000:1000);this.timer.unref?.();}
  }
  tasks(){return this.db.getTasks().filter(t=>t.estado!=='hecho');}
  async send(text,buttons=[]){return this.call('sendMessage',{chat_id:this.config.chatId,text:text.slice(0,4000),...(buttons.length?{reply_markup:{inline_keyboard:buttons}}:{})});}
  buttons(t){return [{text:'Hecho',callback_data:`done:${t.id}`},{text:'En 1 hora',callback_data:`snooze:${t.id}`}];}
  // Telegram expires callback acknowledgements; an old button must not block the update queue.
  async acknowledge(body){try{await this.call('answerCallbackQuery',body);}catch(_){} }
  async digest(manual=false){
    if(!this.config.chatId)throw Error('Abre tu bot y pulsa Iniciar para vincularlo.');
    const tasks=this.tasks().filter(t=>manual||!(this.config.snoozed[t.id]>this.now().getTime()));const shown=tasks.slice(0,5);
    await this.send(tasks.length?`Tienes ${tasks.length} tareas pendientes${tasks.length>5?' (primeras 5; el resto está en Notip)':''}:\n\n${shown.map((t,i)=>`${i+1}. ${String(t.titulo).slice(0,240)}${t.fecha_entrega?` · ${t.fecha_entrega} ${t.hora_entrega||''}`:''}`).join('\n')}`:'No tienes tareas pendientes para mostrar.',shown.map((t,i)=>this.buttons(t).map(b=>({...b,text:`${i+1}. ${b.text}`}))));
  }
  async handle(u){
    if(!this.running||!this.owned())return;
    const m=u.message,cb=u.callback_query;
    if(m?.chat?.type==='private'&&this.config.code&&this.now().getTime()<this.config.expires&&m.text===`/start ${this.config.code}`){this.config.chatId=m.chat.id;delete this.config.code;this.save();await this.send('¡Conectado a Notip! /pendientes muestra tus tareas. /pausa detiene los avisos y /reanudar los activa. Solo funciono mientras Notip esté abierto.');return;}
    const chat=cb?.message?.chat||m?.chat;if(!this.config.chatId||chat?.type!=='private'||chat.id!==this.config.chatId)return;
    if(cb){
      const [action,id]=String(cb.data).split(':');
      if(action==='list'){await this.acknowledge({callback_query_id:cb.id});await this.digest(true);return;}
      const task=/^\d+$/.test(id||'')?this.tasks().find(t=>String(t.id)===id):null;
      if(!task){await this.acknowledge({callback_query_id:cb.id,text:'La tarea ya está terminada o no existe.'});return;}
      if(action==='done'){this.db.updateTaskState(task.id,'hecho');delete this.config.snoozed[id];this.save();this.onTasksChanged(task.id);}
      else if(action==='snooze'){// Retried updates must not extend an already accepted snooze.
        if(this.config.lastSnooze!==u.update_id){this.config.snoozed[id]=this.now().getTime()+3600000;this.config.lastSnooze=u.update_id;this.save();}
      }else return;
      await this.acknowledge({callback_query_id:cb.id,text:action==='done'?'¡Tarea terminada!':'Te recordaré en una hora, respetando tu descanso.'});return;
    }
    if(m.text==='/pendientes')await this.digest(true);
    if(['/pausa','/reanudar'].includes(m.text)){this.config.settings.enabled=m.text==='/reanudar';this.save();await this.send(this.config.settings.enabled?'Recordatorios activados.':'Recordatorios pausados. Puedes seguir usando /pendientes.');}
  }
  async tick(){
    if(!this.running||!this.owned()||!this.config.chatId)return;
    const s={...defaults,...this.config.settings},now=this.now(),ms=now.getTime();if(!s.enabled||quiet(now,s))return;
    const tasks=this.tasks();const sent=this.config.sent;
    for(const [id,at] of Object.entries(this.config.snoozed)){if(!tasks.some(t=>String(t.id)===id))delete this.config.snoozed[id];else if(at<=ms){const t=tasks.find(t=>String(t.id)===id);await this.send(`Retomamos: ${String(t.titulo).slice(0,500)}`,[this.buttons(t)]);delete this.config.snoozed[id];this.config.lastNotice=ms;this.save();return;}}
    if(ms-(this.config.lastNotice||0)<3600000)return;
    if(clock(now)>=s.dailyTime&&this.config.dailyDay!==day(now)){
      if(tasks.some(t=>!(this.config.snoozed[t.id]>ms)))await this.digest();
      this.config.dailyDay=day(now);this.config.lastNotice=ms;this.save();return;
    }
    if(!s.urgent)return;
    for(const t of tasks){if(this.config.snoozed[t.id]>ms||!t.fecha_entrega)continue;const due=new Date(`${t.fecha_entrega}T${t.hora_entrega||'23:59'}:00`).getTime(),left=due-ms;
      if(!Number.isFinite(due)||left>86400000)continue;
      const key=`${t.id}:${due}:${left<=7200000?'soon':'day'}`;if(sent[key])continue;
      await this.send(`${left<0?'Entrega vencida':left<=7200000?'Entrega próxima':'Entrega en las próximas 24 horas'}: ${String(t.titulo).slice(0,500)}\n${t.fecha_entrega} ${t.hora_entrega||''}`,[this.buttons(t),[{text:'Ver pendientes',callback_data:'list'}]]);
      sent[key]=ms;this.config.lastNotice=ms;this.save();return;
    }
  }
}
module.exports={TelegramService,quiet,defaults};
