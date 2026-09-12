const {spawnSync}=require('child_process');
const path=require('path');
const env={...process.env,ANTHROPIC_API_KEY:'',SUPABASE_URL:'',SUPABASE_ANON_KEY:''};
delete env.ELECTRON_RUN_AS_NODE;
for(const script of ['ui-smoke.cjs','boot-smoke.cjs']){
  const child=spawnSync(require('electron'),[path.join(__dirname,script)],{stdio:'inherit',env,windowsHide:true,timeout:90000});
  if(child.error)console.error(child.error.message);
  if(child.status!==0){process.exitCode=child.status??1;break;}
}
