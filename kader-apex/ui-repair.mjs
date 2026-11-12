// Presentation changes only. Preserve the native actions, identity and server data.
export const UI_REPAIR_REV = '20261112.1';
export const UI_REPAIR_CSS_PATH = '/_kader/ui-repair-20261112.css';

export function repairPortalAsset(path, source) {
  if (path.endsWith('/people.js')) {
    const old = "const PREFIX=(globalThis.location?.pathname||'').startsWith('/mowaqqat/')?'/mowaqqat':'';";
    const next = "const PREFIX=document.querySelector('meta[name=\"kader-base-path\"]')?.content||((globalThis.location?.pathname||'').startsWith('/mowaqqat/')?'/mowaqqat':'');";
    return source.replace(old, next);
  }
  if (!/\/app(?:-limited)?\.js$/.test(path)) return source;
  source=repairWorkflowScope(source);
  if(source.includes('KADER_HOME_REPAIR_20261112'))return source;
  // Restrict replacement to the known home renderer. Never replace task workflow code.
  const start = source.indexOf('function homePage(){');
  const end = source.indexOf('function structurePage(){', start);
  if (start < 0 || end < 0 || !source.slice(start, end).includes('أقسام العمل الخمسة')) return source;
  let result = source.slice(0, start) + HOME_RENDERER + '\n' + source.slice(end);
  result = result.replace("'مؤشرات القيادة والمتابعة من الخادم'", "'حالة العمل'");
  return result;
}

export function repairWorkflowScope(source){
  if(source.includes('KADER_WORKFLOW_SCOPE_20261112'))return source;
  // The existing overlay was appended AFTER the application's lexical closure.
  // Bring it inside that closure so it uses the original session, state and CSRF.
  const init=source.indexOf('init().catch(e=>');
  const close=source.indexOf('\n})();',init);
  const workflow=source.indexOf('function workflowCan',close);
  if(init<0||close<0||workflow<0)return source;
  const candidate=source.slice(0,close)+'\n/* KADER_WORKFLOW_SCOPE_20261112 */\n'+source.slice(close+'\n})();'.length)+'\n})();\n';
  // Compile, but never execute, before serving a rewrite of the native module.
  try{new Function(candidate);}catch(error){console.error('Kader workflow scope repair rejected:',error.message);return source;}
  return candidate;
}

const HOME_RENDERER = String.raw`/* KADER_HOME_REPAIR_20261112 */
function homePage(){
 const unique=items=>Array.from(new Map((items||[]).map((item,index)=>[item.id||'row-'+index,item])).values());
 const tasks=unique(state.tasks),open=tasks.filter(t=>!taskClosed(t));
 const cards=WORK_SECTIONS.filter(([key])=>moduleAllowed(key));
 const priority=t=>({'عاجلة':0,'عالية':1,'متوسطة':2,'منخفضة':3}[t.priority]??4);
 const attention=[...open].sort((a,b)=>Number(isLate(b))-Number(isLate(a))||priority(a)-priority(b)||(a.due||'9999').localeCompare(b.due||'9999')).slice(0,5);
 return '<div class="kader-home">'
 + '<section class="sites-native-cover"><div><span class="sites-native-eyebrow">قطاع الدعاية والإعلام · الصندوق السيادي السوري</span><h1>أهلاً '+h(uiPerson())+'</h1><p>أعمال الإدارة ومشاريعها في مكان واحد.</p><div class="tool-row"><button class="btn" data-nav="mywork">أعمالي واستحقاقاتي</button></div></div></section>'
 + '<div class="stats-grid">'+metric('المشاريع',unique(state.projects).length,'ضمن صلاحياتك','layers')+metric('المهام المفتوحة',open.length,'تحتاج متابعة','check-square')+metric('دليل الفريق',unique(state.members).length,'بطاقات الفريق','users')+metric('التقارير',unique(state.reports).length,'التقارير المسجلة','file-text')+'</div>'
 + (serverMode?'<div id="executiveBrief" aria-live="polite" aria-busy="true" class="executive-brief"><div class="note">جارٍ تحميل حالة العمل…</div></div>':'')
 + panel('أقسام العمل','<div class="hub-grid">'+cards.map(([key,ico,label,description])=>'<article class="hub-card">'+icon(ico,22)+'<div><h2>'+h(label)+'</h2><p>'+h(description)+'</p></div><button class="btn ghost" data-nav="'+h(key)+'" aria-label="فتح '+h(label)+'">فتح '+h(label)+'</button></article>').join('')+'</div>')
 + panel('الأعمال ذات الأولوية','<p class="muted">أقرب '+attention.length+' أعمال تحتاج متابعة</p>'+attention.map(t=>'<div class="mini-rule"><div><button class="link-button" data-act="edit-task" data-id="'+h(t.id)+'">'+h(t.title)+'</button><p>'+h(proj(t.projectId)?.name||t.department||'عمل عام')+' · '+h(person(t.assignee)?.name||'غير مسند')+'</p><div class="kader-priority-meta">'+badge(t.status)+(isLate(t)?badge('متأخرة'):'')+'<span>'+fmtDate(t.due)+'</span></div></div></div>').join('')+(attention.length?'':'<p>لا توجد مهام مفتوحة ضمن صلاحياتك.</p>'),'<button class="btn small ghost" data-nav="tasks">كل المهام</button>')
 + '</div>';
}
`;
