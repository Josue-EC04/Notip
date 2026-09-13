const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TelegramService,quiet,defaults}=require('../src/telegram/telegramService');
function setup(){
  let date=new Date(2026,8,13,18,0),owner='user1',fail=false;
  const calls=[],tasks=[{id:1,titulo:'Entregar práctica',fecha_entrega:'2026-09-14',hora_entrega:'12:00',estado:'pendiente'},{id:2,titulo:'Leer capítulo',estado:'pendiente'}];
  let stored={owner,token:'123:abcdefghijklmnopqrstuvwxyz',chatId:42,username:'notip_test_bot',settings:{...defaults},sent:{},snoozed:{}};
  const store={get:()=>structuredClone(stored),set:(_k,v)=>{stored=structuredClone(v);}};
  const changed=[];const db={getTasks:()=>tasks,updateTaskState:(id,s)=>{tasks.find(t=>t.id===id).estado=s;}};
  const transport=async(token,method,body)=>{calls.push({method,body});if(fail)throw Error('offline');if(method==='getMe')return {is_bot:true,username:'notip_test_bot'};if(method==='getWebhookInfo')return {url:''};return [];};
  const bot=new TelegramService({store,db,getOwner:()=>owner,transport,now:()=>date,onTasksChanged:id=>changed.push(id)});bot.running=true;
  return {bot,calls,tasks,changed,store,db,transport,setDate:d=>date=d,setOwner:v=>owner=v,setFail:v=>fail=v};
}
test('quiet hours cross midnight and normal intervals',()=>{
  for(const h of [0,7,22,23])assert.equal(quiet(new Date(2026,8,13,h),defaults),true);
  for(const h of [8,12,21])assert.equal(quiet(new Date(2026,8,13,h),defaults),false);
  assert.equal(quiet(new Date(2026,8,13,12),{quietStart:'10:00',quietEnd:'14:00'}),true);
});
test('daily digest persists across restart, omits done tasks and respects quiet hours',async()=>{
  const f=setup();f.tasks[1].estado='hecho';await f.bot.tick();await f.bot.tick();
  assert.equal(f.calls.length,1);assert.match(f.calls[0].body.text,/1 tareas/);assert.doesNotMatch(f.calls[0].body.text,/Leer/);
  const restarted=new TelegramService({store:f.store,db:f.db,transport:f.transport,getOwner:()=> 'user1',now:()=>new Date(2026,8,13,18,5)});restarted.running=true;await restarted.tick();assert.equal(f.calls.length,1);
  f.setDate(new Date(2026,8,14,23));await f.bot.tick();assert.equal(f.calls.length,1);
});
test('failed delivery is retried without marking daily digest sent',async()=>{
  const f=setup();f.setFail(true);await assert.rejects(f.bot.tick(),/offline/);assert.equal(f.bot.config.dailyDay,undefined);
  f.setFail(false);await f.bot.tick();assert.equal(f.bot.config.dailyDay,'2026-09-13');
});
test('callbacks verify private chat, mark local task done and snooze idempotently',async()=>{
  const f=setup();const update=(id,chat,data)=>({update_id:id,callback_query:{id:String(id),message:{chat:{id:chat,type:'private'}},data}});
  await f.bot.handle(update(1,99,'done:1'));assert.equal(f.tasks[0].estado,'pendiente');
  await f.bot.handle(update(2,42,'snooze:1'));const due=f.bot.config.snoozed[1];
  f.setDate(new Date(2026,8,13,18,30));await f.bot.handle(update(2,42,'snooze:1'));assert.equal(f.bot.config.snoozed[1],due);
  f.setDate(new Date(2026,8,13,19,1));await f.bot.tick();assert.match(f.calls.at(-1).body.text,/Retomamos/);
  await f.bot.handle(update(3,42,'done:1'));assert.equal(f.tasks[0].estado,'hecho');assert.deepEqual(f.changed,[1]);
  await f.bot.handle(update(4,42,'done:1'));assert.deepEqual(f.changed,[1]);
});
test('pairing requires a fresh code and the same signed-in owner; state never exposes token',async()=>{
  const f=setup();delete f.bot.config.chatId;f.bot.config.code='unique';f.bot.config.expires=new Date(2026,8,13,18,10).getTime();
  const m=text=>({message:{chat:{id:42,type:'private'},text}});
  await f.bot.handle(m('/start'));assert.equal(f.bot.config.chatId,undefined);
  await f.bot.handle(m('/start unique'));assert.equal(f.bot.config.chatId,42);assert.equal(f.bot.state().token,undefined);
  f.setOwner('user2');await assert.rejects(f.bot.digest(true),/detenido/);assert.equal(f.bot.state().linked,false);
  f.bot.stop();await assert.rejects(f.bot.send('test'),/detenido/);
});
test('urgent delivery is deduplicated and paused notifications do not send',async()=>{
  const f=setup();f.bot.config.settings.dailyTime='21:00';await f.bot.tick();assert.match(f.calls[0].body.text,/24 horas/);
  f.setDate(new Date(2026,8,13,19,2));await f.bot.tick();assert.equal(f.calls.length,1);
  f.bot.config.settings.enabled=false;f.setDate(new Date(2026,8,14,11));await f.bot.tick();assert.equal(f.calls.length,1);
});
test('invalid settings and webhook bots leave existing connection unchanged',async()=>{
  const f=setup();assert.throws(()=>f.bot.settings({...defaults,quietStart:'22:00',quietEnd:'22:00'}),/distintos/);
  f.bot.transport=async(_t,m)=>m==='getMe'?{is_bot:true,username:'test_bot'}:{url:'https://example.org/hook'};
  await assert.rejects(f.bot.configure('321:abcdefghijklmnopqrstuvwxyz'),/webhook/);assert.equal(f.bot.config.chatId,42);
});
test('bot can be configured after logout; disconnect cancels pending configuration',async()=>{
  const f=setup();f.bot.stop();f.bot.start=function(){this.running=true;this.controller=new AbortController();};
  const state=await f.bot.configure('321:abcdefghijklmnopqrstuvwxyz');assert.equal(state.configured,true);assert.equal(state.linked,false);assert.match(state.pairUrl,/https:\/\/t.me\/notip_test_bot\?start=/);
  let resolve;f.bot.transport=(_t,m)=>m==='getMe'?new Promise(r=>resolve=r):Promise.resolve({url:''});
  const pending=f.bot.configure('456:abcdefghijklmnopqrstuvwxyz');f.bot.disconnect();resolve({is_bot:true,username:'new_bot'});
  await assert.rejects(pending,/canceló/);assert.equal(f.bot.state().configured,false);
});
