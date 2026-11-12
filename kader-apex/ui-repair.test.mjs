import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createPortalGateway} from './gateway.mjs';
import {repairPortalAsset,repairWorkflowScope,UI_REPAIR_CSS_PATH} from './ui-repair.mjs';

test('asset repair preserves task renderer and is repeatable',()=>{
 const tasks='function tasksPage(){return "native workflow"}';
 const src='function homePage(){/*أقسام العمل الخمسة*/}\nfunction structurePage(){return "structure"}\n'+tasks;
 const out=repairPortalAsset('/mowaqqat/app.js',src);
 assert.ok(out.includes(tasks));
 assert.ok(out.includes('KADER_HOME_REPAIR_20261112'));
 assert.equal(repairPortalAsset('/mowaqqat/app.js',out),out);
 new vm.Script(out);
 assert.equal(repairPortalAsset('/mowaqqat/api/state',src),src);
});
test('unknown application source is not rewritten',()=>{
 const src='function homePage(){return "changed runtime"}';
 assert.equal(repairPortalAsset('/mowaqqat/app.js',src),src);
});
test('workflow overlay shares the original private session and state after repair',()=>{
 const source='(()=>{const serverMode=true;const session={user:{id:"fixture"}};const state={tasks:[1]};function init(){return Promise.resolve();}\ninit().catch(e=>{throw e});\n})();\nfunction workflowCan(){return serverMode&&session.user.id==="fixture"&&state.tasks.length===1;}\nglobalThis.workflowResult=workflowCan();';
 assert.throws(()=>vm.runInNewContext(source),/serverMode/);
 const fixed=repairWorkflowScope(source);
 const context=vm.createContext({});vm.runInContext(fixed,context);
 assert.equal(context.workflowResult,true);
 assert.equal(repairWorkflowScope(fixed),fixed);
});
test('home shows unique open priority tasks without changing the underlying records',()=>{
 const fixture='function homePage(){/*أقسام العمل الخمسة*/}\nfunction structurePage(){}';
 const source=repairPortalAsset('/mowaqqat/app.js',fixture);
 const tasks=Array.from({length:8},(_,i)=>({id:'task-'+i,title:'عمل '+i,status:i===7?'مكتملة':'قيد التنفيذ',priority:i===2?'عاجلة':'متوسطة',due:'2027-01-01'}));
 tasks.push({...tasks[0]});
 const state={tasks,projects:[],members:[],reports:[]};
 const before=JSON.stringify(state);
 const context=vm.createContext({state,serverMode:false,WORK_SECTIONS:[],moduleAllowed:()=>true,taskClosed:t=>t.status==='مكتملة',isLate:()=>false,h:String,uiPerson:()=> 'اختبار',metric:()=>'',panel:(_title,content,action='')=>content+action,badge:()=>'',fmtDate:()=>'',proj:()=>null,person:()=>null});
 vm.runInContext(source+';result=homePage();',context);
 const ids=[...context.result.matchAll(/data-act="edit-task" data-id="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,5);
 assert.equal(new Set(ids).size,5);
 assert.equal(ids[0],'task-2');
 assert.ok(!ids.includes('task-7'));
 assert.equal(JSON.stringify(state),before);
});
test('recruitment resolves labels through the existing apex base path',()=>{
 const src="const PREFIX=(globalThis.location?.pathname||'').startsWith('/mowaqqat/')?'/mowaqqat':'';";
 const next=repairPortalAsset('/mowaqqat/people.js',src);
 assert.match(next,/kader-base-path/);
 assert.equal(repairPortalAsset('/mowaqqat/people.js',next),next);
});
test('HTML receives one responsive stylesheet and retains the session cookie',async()=>{
 const gateway=createPortalGateway({fetcher:async()=>new Response('<html><head></head><body data-kader-ui="portal"></body></html>',{headers:{'content-type':'text/html','set-cookie':'mowaqqat_session=test; Path=/mowaqqat/; HttpOnly; SameSite=Lax'}})});
 const response=await gateway(new Request('https://kader.media/'));
 const html=await response.text();
 assert.equal(html.split(UI_REPAIR_CSS_PATH).length-1,1);
 assert.match(html,/<base href="\/mowaqqat\/">/);
 assert.match(response.headers.get('set-cookie'),/mowaqqat_session=test/);
 assert.match(response.headers.get('set-cookie'),/Secure/);
});
test('visual stylesheet is served without calling upstream, and rejects writes',async()=>{
 const gateway=createPortalGateway({fetcher:()=>{throw Error('unexpected upstream')}});
 const response=await gateway(new Request('https://kader.media'+UI_REPAIR_CSS_PATH));
 assert.equal(response.status,200);
 assert.match(await response.text(),/flex-basis:auto/);
 const write=await gateway(new Request('https://kader.media'+UI_REPAIR_CSS_PATH,{method:'POST'}));
 assert.equal(write.status,405);
});
test('API responses and cross-origin protections remain intact',async()=>{
 const body='{"state":{"tasks":[{"id":"fixture"}]},"revision":99}';
 const gateway=createPortalGateway({fetcher:async()=>new Response(body,{headers:{'content-type':'application/json'}})});
 const response=await gateway(new Request('https://kader.media/mowaqqat/api/state'));
 assert.equal(await response.text(),body);
 const write=await gateway(new Request('https://kader.media/mowaqqat/api/state',{method:'POST',headers:{origin:'https://example.org'},body:'{}'}));
 assert.equal(write.status,403);
});
