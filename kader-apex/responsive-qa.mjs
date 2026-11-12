// Isolated browser checks use invented fixtures. No production API or account is used.
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {join,extname} from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {createPortalGateway} from './gateway.mjs';
const reference=process.env.KADER_QA_REFERENCE;
if(!reference)throw Error('Set KADER_QA_REFERENCE to the locally materialized reference folder');
const user={id:'qa-user',memberId:'qa-user',name:'مستخدم الاختبار',role:'owner',founder:true,modules:['home','tasks','mywork','projects','team','recruitment','reports','finance','companies','legal','production','structure','office','calendar','tracking','files','integrations','settings']};
const tasks=Array.from({length:7},(_,i)=>({id:'qa-task-'+i,title:'مهمة اختبار '+i,assignee:user.id,reviewer:user.id,projectId:'qa-project',status:i===6?'مكتملة':'قيد التنفيذ',priority:i===2?'عاجلة':'متوسطة',due:i===1?'2026-01-01':'2027-01-01',department:'قسم المشاريع'}));
const state={settings:{name:'مساحة التحقق',companies:[]},members:[{id:user.id,name:user.name}],projects:[{id:'qa-project',name:'مشروع التحقق'}],tasks,plans:[],reports:[],taskRequests:[],worklogs:[],activity:[],files:[],links:[],candidates:[],expenses:[],advances:[],financeLedger:[]};
async function upstream(url){
 const pathname=new URL(url).pathname.replace(/^\/mowaqqat/,'');
 let json;
 if(pathname==='/api/health')json={app:'mowaqqat',ok:true};
 else if(pathname==='/api/me')json={user,csrf:'qa-only'};
 else if(pathname==='/api/state')json={state,revision:1};
 else if(pathname==='/api/hub/executive-summary')json={schemaVersion:'kader-executive-overview/1',sourceOfTruth:'kader-native-authorized-projection',readOnly:true,metrics:{tasksOverdue:1,tasksAwaitingReview:0,tasksBlocked:0,plansDueNext7Days:0},companyOperations:[],scope:'executive',asOfDate:'2026-11-12',revision:1};
 else if(pathname==='/api/integrations/status')json={marsad:{readOnlyConfigured:false}};
 else if(pathname==='/api/recruitment/companies')json={companies:[]};
 else if(pathname.startsWith('/api/'))json={};
 if(json)return Response.json(json);
 const rel=pathname==='/'?'index.html':pathname.replace(/^\//,'');
 if(rel.includes('..'))return new Response('Forbidden',{status:403});
 const fromHR=['app.js','app-limited.js','index.html','people.js','people-embedded.css'].includes(rel);
 try{
  let body=await readFile(join(reference,fromHR?'hr/changes/web':'base/source/web',rel));
  const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'}[extname(rel)]||'application/octet-stream';
  return new Response(body,{headers:{'content-type':mime}});
 }catch{return new Response('Not found',{status:404});}
}
let repaired=false;
const gateway=createPortalGateway({allowedHosts:['kader.media'],fetcher:upstream});
const server=createServer(async(req,res)=>{
 try{
  const request=new Request('https://kader.media'+req.url);
  const response=repaired?await gateway(request):await upstream('https://upstream/mowaqqat'+(req.url==='/'?'/':req.url.replace(/^\/mowaqqat/,'')));
  let b=Buffer.from(await response.arrayBuffer());
  if(!repaired&&req.url==='/')b=Buffer.from(b.toString().replace('<head>','<head><base href="/mowaqqat/"><meta name="kader-base-path" content="/mowaqqat">'));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(b);
 }catch(e){res.writeHead(500);res.end(e.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
await mkdir('/tmp/kader-qa',{recursive:true});
try{
 for(const width of [390,430,768,1440]){
  for(const phase of ['before','after']){
   repaired=phase==='after';
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'networkidle'});
   await page.waitForSelector('#executiveBrief .panel');
   const metrics=await page.evaluate(()=>({
    width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
    headings:[...document.querySelectorAll('.panel-head')].map(n=>Math.round(n.getBoundingClientRect().height)),
    hubCards:[...document.querySelectorAll('.hub-card')].map(n=>Math.round(n.getBoundingClientRect().height)),
    topbar:Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
    hero:Math.round(document.querySelector('.sites-native-cover').getBoundingClientRect().height),
    priority:[...document.querySelectorAll('[data-act="edit-task"]')].map(n=>n.dataset.id)
   }));
   if(phase==='after'){
    assert.equal(metrics.overflow,false,'No horizontal overflow at '+width);
    assert.ok(Math.max(...metrics.headings)<120,'No flex-basis vertical spacer at '+width);
    assert.ok(Math.max(...metrics.hubCards)<260,'Compact section cards at '+width);
    assert.ok(metrics.priority.length<=5,'Five priority tasks, no duplicate display');
    assert.equal(new Set(metrics.priority).size,metrics.priority.length);
    await page.getByRole('button',{name:'كل المهام',exact:true}).click();
    await page.waitForSelector('#taskQ');
    assert.equal(await page.locator('.kanban-card').count(),7,'Native task page works');
    await page.goto(base,{waitUntil:'networkidle'});
    await page.screenshot({path:'/tmp/kader-qa/after-'+width+'.png',fullPage:true});
   }else await page.screenshot({path:'/tmp/kader-qa/before-'+width+'.png',fullPage:true});
   results.push({phase,...metrics,errors});
   await page.close();
  }
 }
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
