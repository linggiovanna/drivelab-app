const STORAGE_KEY = "drivelab_knowledge_v1";
const DAILY_LIMIT = 5;
const CATEGORIES = ["全部","产品基础","系统架构","核心硬件","影像系统","存储与编码","连接与通信","定位与传感器","停车监控","扩展摄像头","算法与AI","项目实战","数据与产品分析","产品判断"];
let allCards = [];
let appData = {cards:[], progress:{}, lastStudyDate:null, streak:0};
let currentTab = "home";
let activeCategory = "全部";
let searchText = "";
let studyQueue = [];
let studyIndex = 0;
let answerShown = false;
let detailCardId = null;

const $ = (sel, root=document) => root.querySelector(sel);
const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const todayKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"}) : "尚未学习";
const getProgress = id => appData.progress[id] || null;
const dueCards = () => appData.cards.filter(c => { const p=getProgress(c.id); return !p || !p.dueAt || p.dueAt <= Date.now(); });
const learnedCount = () => Object.values(appData.progress).filter(p => p.reps>0).length;
const masteredCount = () => Object.values(appData.progress).filter(p => p.interval>=14 && p.reps>=3).length;
const categoryCount = name => appData.cards.filter(c=>c.category===name).length;
const statusLabel = status => status?.includes("项目数据") || status?.includes("待核对") || status?.includes("需核对") || status?.includes("待验证") ? status : "资料参考";

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); }
function loadSaved(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw){ const d=JSON.parse(raw); if(d && Array.isArray(d.cards)){ appData={...appData,...d}; } }
  }catch(e){ console.warn("本地数据读取失败",e); }
}
async function init(){
  try{
    const res=await fetch("cards.json");
    const data=await res.json();
    allCards=data.cards||[];
  }catch(e){ allCards=window.INITIAL_CARDS||[]; }
  loadSaved();
  if(!appData.cards.length) appData.cards=allCards;
  else{
    const known=new Set(appData.cards.map(c=>c.id));
    allCards.forEach(c=>{if(!known.has(c.id)) appData.cards.push(c);});
  }
  save();
  render();
  if("serviceWorker" in navigator && location.protocol.startsWith("http")){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
}
function setTab(tab){
  currentTab=tab;
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  render();
}
function render(){
  const main=$("#main");
  if(currentTab==="home") main.innerHTML=renderHome();
  else if(currentTab==="study") main.innerHTML=renderStudy();
  else if(currentTab==="library") main.innerHTML=renderLibrary();
  else if(currentTab==="mine") main.innerHTML=renderMine();
  else if(currentTab==="detail") main.innerHTML=renderDetail();
}
function renderHome(){
  const due=dueCards().length, total=appData.cards.length, learned=learnedCount(), mastered=masteredCount();
  const cats=["核心硬件","影像系统","存储与编码","连接与通信","算法与AI","项目实战"];
  return `
    <section class="hero">
      <div class="eyebrow">YOUR DAILY HARDWARE LAB</div>
      <h1>每天 10 分钟，<br>把技术变成产品判断力。</h1>
      <p>从记录仪硬件原理，到真实项目问题。少背术语，多理解它如何影响用户体验。</p>
      <div class="hero-actions">
        <button class="btn btn-light" data-action="start-study">开始今日学习 →</button>
        <button class="btn" style="background:rgba(255,255,255,.14);color:#fff" data-tab-jump="library">浏览知识库</button>
      </div>
      <div class="stat-inline">
        <div><strong>${total}</strong><span>知识卡片</span></div>
        <div><strong>${due}</strong><span>待学习 / 复习</span></div>
        <div><strong>${mastered}</strong><span>已掌握</span></div>
      </div>
    </section>
    <div class="section-head"><h2>今日学习计划</h2><span class="small-note">建议 5 张 / 天</span></div>
    <section class="panel">
      <div class="daily-row">
        <div class="daily-icon">✦</div>
        <div class="daily-copy"><strong>${due ? `今天还有 ${Math.min(due,DAILY_LIMIT)} 张卡片` : "今天的卡片已完成"}</strong><span>${due ? "先复习到期知识，再学习新卡片。" : "可以去知识库自由探索，或添加新的工作问题。"}</span></div>
        <button class="btn btn-primary" data-action="start-study">${due?"开始":"继续"} </button>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${total?Math.round(learned/total*100):0}%"></div></div>
      <div class="small-note" style="margin-top:7px">已学习 ${learned} / ${total} 张 · 掌握度按间隔复习记录估算</div>
    </section>
    <div class="notice">知识边界提醒：项目规格、测试数字和培训资料中的典型参数都有适用范围。卡片会标注来源与核验状态；涉及具体型号时，以最终规格书和实测为准。</div>
    <div class="section-head"><h2>按主题学习</h2><button data-tab-jump="library">全部分类</button></div>
    <div class="category-grid">
      ${cats.map(c=>`<button class="category-tile" data-category-jump="${esc(c)}"><strong><i class="category-dot"></i>${esc(c)}</strong><span>${categoryCount(c)} 张卡片</span></button>`).join("")}
    </div>
  `;
}
function renderStudy(){
  if(!studyQueue.length) return `<div class="study-empty"><div class="big">✦</div><h2>准备开始今天的学习</h2><p>系统会优先安排到期复习，再补充新卡片。每次默认 5 张，适合碎片时间。</p><button class="btn btn-primary" data-action="start-study">开始学习</button></div>`;
  if(studyIndex>=studyQueue.length) return `<div class="study-empty"><div class="big">✓</div><h2>今天完成了！</h2><p>本轮已完成 ${studyQueue.length} 张卡片。明天再复习一次，让知识留得更久。</p><button class="btn btn-primary" data-action="start-study">再学一轮</button><button class="btn btn-outline" style="margin-left:6px" data-tab-jump="library">浏览知识库</button></div>`;
  const card=studyQueue[studyIndex];
  const progress=Math.round(studyIndex/studyQueue.length*100);
  return `
    <div class="study-top"><span>今日学习 · ${studyIndex+1} / ${studyQueue.length}</span><span>${esc(card.category)}</span></div>
    <div class="study-track"><span style="width:${progress}%"></span></div>
    <article class="flashcard">
      <div class="flash-kicker">${esc(card.category)}　·　${esc(card.level||"入门")}</div>
      <div class="flash-question">${esc(card.question)}</div>
      ${answerShown ? `
        <div class="answer-block">
          <div class="answer-label">核心答案</div>
          <div class="answer-main">${esc(card.answer)}</div>
          <div class="answer-detail">${esc(card.explain||"")}</div>
          ${card.example?`<div class="answer-example"><b>工作场景：</b>${esc(card.example)}</div>`:""}
          ${card.pmUse?`<div class="answer-example"><b>产品经理关注：</b>${esc(card.pmUse)}</div>`:""}
          <div class="source-line">来源：${esc(card.source||"个人卡片")} · ${esc(card.status||"个人整理")}</div>
        </div>` : `<div class="flash-hint">先在脑中回答：它是什么？解决什么问题？会影响哪个产品体验？</div>`}
    </article>
    ${answerShown ? `
      <div class="grade-grid">
        <button class="grade-btn again" data-grade="again">没记住<small>明天再来</small></button>
        <button class="grade-btn" data-grade="hard">有点模糊<small>2 天后</small></button>
        <button class="grade-btn good" data-grade="good">记住了<small>间隔增加</small></button>
        <button class="grade-btn" data-grade="easy">很熟悉<small>更久复习</small></button>
      </div>` : `<button class="btn btn-primary" style="width:100%;margin-top:14px;padding:14px" data-action="reveal">查看答案</button>`}
    <div class="small-note" style="margin-top:12px;text-align:center">复习依据你的自评调整间隔；进度保存在当前浏览器中。</div>
  `;
}
function renderLibrary(){
  const filtered=appData.cards.filter(c=>{
    const catOk=activeCategory==="全部"||c.category===activeCategory;
    const q=searchText.trim().toLowerCase();
    const text=[c.question,c.answer,c.explain,c.example,c.pmUse,c.source,...(c.tags||[])].join(" ").toLowerCase();
    return catOk&&(!q||text.includes(q));
  });
  return `
    <div class="page-title">知识库</div>
    <p class="page-subtitle">按主题查找知识。每张卡片都保留来源，项目数据与通用原理分开标记。</p>
    <div class="search-box"><span>⌕</span><input id="search-input" type="search" placeholder="搜索 Sensor、ISP、4G、码率…" value="${esc(searchText)}"></div>
    <div class="filter-row">${CATEGORIES.map(c=>`<button class="chip ${activeCategory===c?"active":""}" data-filter="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    <div class="section-head" style="margin-top:8px"><h2>${filtered.length} 张卡片</h2><span class="small-note">${activeCategory==="全部"?"全部主题":esc(activeCategory)}</span></div>
    <div class="card-list">
      ${filtered.map(c=>{
        const p=getProgress(c.id);
        const st=statusLabel(c.status);
        return `<button class="knowledge-card" data-open-card="${esc(c.id)}">
          <div class="card-topline"><span class="card-category">${esc(c.category)} · ${esc(c.level||"入门")}</span>${st!=="资料参考"?`<span class="card-status">${esc(st)}</span>`:""}</div>
          <h3>${esc(c.question)}</h3>
          <div class="card-meta"><span>${p&&p.reps>0?"已学 · 下次 "+fmtDate(p.dueAt):"未学习"}</span><span>·</span><span>${esc((c.tags||[]).slice(0,2).join(" / "))}</span></div>
        </button>`;
      }).join("") || `<div class="empty-note">没有找到匹配卡片，试试其他关键词或分类。</div>`}
    </div>
  `;
}
function renderMine(){
  const total=appData.cards.length, learned=learnedCount(), mastered=masteredCount(), due=dueCards().length;
  return `
    <div class="page-title">我的学习</div>
    <p class="page-subtitle">学习数据和新增卡片都保存在这台设备的浏览器中。</p>
    <div class="profile-card">
      <strong>持续积累，不靠突击。</strong>
      <p>知识库来自你的项目资料与工作讨论。把工作中遇到的新问题继续沉淀成卡片，才会形成长期可复用的知识资产。</p>
      <div class="stat-inline">
        <div><strong>${total}</strong><span>总卡片</span></div>
        <div><strong>${learned}</strong><span>已学习</span></div>
        <div><strong>${mastered}</strong><span>已掌握</span></div>
      </div>
    </div>
    <div class="section-head"><h2>知识管理</h2></div>
    <div class="setting-list">
      <div class="setting-row"><div class="setting-icon">＋</div><div class="setting-copy"><strong>新增知识卡片</strong><span>把今天工作中遇到的问题变成自己的知识。</span></div><button data-action="add-card">新增</button></div>
      <div class="setting-row"><div class="setting-icon">⇧</div><div class="setting-copy"><strong>导入卡片 JSON</strong><span>导入 ChatGPT 根据新文档整理的卡片，自动合并重复 ID。</span></div><button data-action="import">导入</button></div>
      <div class="setting-row"><div class="setting-icon">⇩</div><div class="setting-copy"><strong>导出学习备份</strong><span>包含全部卡片、复习进度和自定义内容。</span></div><button data-action="export">导出</button></div>
      <div class="setting-row"><div class="setting-icon">✎</div><div class="setting-copy"><strong>复制 AI 制卡提示词</strong><span>把新文档交给 ChatGPT，按统一结构生成可导入卡片。</span></div><button data-action="copy-prompt">复制</button></div>
    </div>
    <div class="section-head"><h2>使用说明</h2></div>
    <div class="panel">
      <div class="small-note">• 首次打开后，卡片和复习记录保存在当前浏览器。<br>• 建议每周导出一次 JSON 备份。<br>• 不同浏览器、不同设备之间不会自动同步。<br>• 离线使用需先通过 HTTPS 地址打开并完成首次缓存。<br>• 本版不连接外部 AI 服务，导入的新卡片需先在 ChatGPT 生成 JSON，再导入本 App。</div>
    </div>
  `;
}
function renderDetail(){
  const c=appData.cards.find(x=>x.id===detailCardId);
  if(!c){currentTab="library";return renderLibrary();}
  return `
    <button class="btn btn-ghost" data-action="back-library">← 返回知识库</button>
    <div class="detail-panel" style="margin-top:12px">
      <div class="card-topline"><span class="card-category">${esc(c.category)} · ${esc(c.level||"入门")}</span><span class="card-status">${esc(statusLabel(c.status))}</span></div>
      <h2>${esc(c.question)}</h2>
      <div class="detail-section"><h4>核心答案</h4><p>${esc(c.answer)}</p></div>
      <div class="detail-section"><h4>原理解释</h4><p>${esc(c.explain||"暂无补充")}</p></div>
      ${c.example?`<div class="detail-section"><h4>工作场景</h4><p>${esc(c.example)}</p></div>`:""}
      ${c.pmUse?`<div class="detail-section"><h4>产品经理关注</h4><p>${esc(c.pmUse)}</p></div>`:""}
      <div class="source-line">知识来源：${esc(c.source||"个人新增")}<br>标签：${esc((c.tags||[]).join("、")||"无")}</div>
      <div class="toolbar"><button class="btn btn-primary" data-action="study-this" data-id="${esc(c.id)}">加入学习</button><button class="btn btn-outline" data-action="edit-card" data-id="${esc(c.id)}">编辑卡片</button></div>
    </div>
  `;
}
function startStudy(){
  const due=dueCards();
  const newOrDue=due.sort((a,b)=>{
    const pa=getProgress(a.id), pb=getProgress(b.id);
    const aDue=!!pa && (!pa.dueAt || pa.dueAt<=Date.now());
    const bDue=!!pb && (!pb.dueAt || pb.dueAt<=Date.now());
    if(aDue && !bDue)return -1;
    if(bDue && !aDue)return 1;
    if(!pa && pb)return 1;
    if(pa && !pb)return -1;
    return (pa?.dueAt||0)-(pb?.dueAt||0);
  });
  studyQueue=newOrDue.slice(0,DAILY_LIMIT);
  if(!studyQueue.length) studyQueue=appData.cards.slice(0,Math.min(DAILY_LIMIT,appData.cards.length));
  studyIndex=0;answerShown=false;setTab("study");
}
function reveal(){answerShown=true;render();}
function grade(value){
  const card=studyQueue[studyIndex]; if(!card)return;
  const old=getProgress(card.id)||{interval:0,reps:0,correct:0};
  let interval=1;
  if(value==="again") interval=1;
  if(value==="hard") interval=Math.max(2,Math.round((old.interval||1)*1.35));
  if(value==="good") interval=Math.max(3,Math.round((old.interval||1)*2.1));
  if(value==="easy") interval=Math.max(5,Math.round((old.interval||1)*3.2));
  interval=Math.min(interval,90);
  appData.progress[card.id]={interval,reps:(old.reps||0)+1,correct:(old.correct||0)+(value==="again"?0:1),lastGrade:value,lastSeen:Date.now(),dueAt:Date.now()+interval*86400000};
  const today=todayKey();
  if(appData.lastStudyDate!==today){
    const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);const yKey=`${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}-${String(yesterday.getDate()).padStart(2,"0")}`;
    if(appData.lastStudyDate===yKey) appData.streak=(appData.streak||0)+1;
    else appData.streak=1;
    appData.lastStudyDate=today;
  }
  save();studyIndex++;answerShown=false;render();
}
function openDetail(id){detailCardId=id;currentTab="detail";document.querySelectorAll(".nav-item").forEach(b=>b.classList.remove("active"));render();}
function openModal(title,body){
  $("#modal-root").innerHTML=`<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>${title}</h3><button class="close-btn" data-action="close-modal">×</button></div>${body}</div></div>`;
}
function closeModal(){$("#modal-root").innerHTML="";}
function addCardModal(existing=null){
  const c=existing||{};
  const cats=CATEGORIES.filter(x=>x!=="全部");
  openModal(existing?"编辑知识卡片":"新增知识卡片",`
    <form id="card-form">
      <div class="form-field"><label>问题 / 标题 *</label><textarea name="question" required>${esc(c.question||"")}</textarea></div>
      <div class="form-field"><label>核心答案 *</label><textarea name="answer" required>${esc(c.answer||"")}</textarea></div>
      <div class="form-field"><label>原理解释</label><textarea name="explain">${esc(c.explain||"")}</textarea></div>
      <div class="form-field"><label>工作场景 / 例子</label><textarea name="example">${esc(c.example||"")}</textarea></div>
      <div class="form-field"><label>产品经理关注</label><textarea name="pmUse">${esc(c.pmUse||"")}</textarea></div>
      <div class="form-field"><label>分类</label><select name="category">${cats.map(x=>`<option ${c.category===x?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
      <div class="form-field"><label>知识来源</label><input name="source" value="${esc(c.source||"个人新增")}"></div>
      <div class="form-field"><label>核验状态</label><select name="status"><option ${!c.status||c.status==="个人新增"?"selected":""}>个人新增</option><option ${c.status==="参考知识"?"selected":""}>参考知识</option><option ${c.status==="项目数据·需核对口径"?"selected":""}>项目数据·需核对口径</option><option ${c.status==="项目方案·具体型号"?"selected":""}>项目方案·具体型号</option><option ${c.status==="待验证"?"selected":""}>待验证</option><option ${c.status==="已核验"?"selected":""}>已核验</option></select></div>
      <div class="form-actions"><button type="button" class="btn btn-outline" data-action="close-modal">取消</button><button type="submit" class="btn btn-primary">保存卡片</button></div>
    </form>
  `);
  $("#card-form").addEventListener("submit",e=>{
    e.preventDefault();const fd=new FormData(e.target);
    const obj=Object.fromEntries(fd.entries());
    const id=existing?.id||("u_"+Date.now());
    const next={...c,...obj,id,level:c.level||"自定义",tags:c.tags||[]};
    if(existing){appData.cards=appData.cards.map(x=>x.id===id?next:x);}
    else appData.cards.unshift(next);
    save();closeModal();currentTab=existing?"detail":"library";detailCardId=id;render();
  });
}
const importPrompt = `请把我接下来提供的智能硬件/行车记录仪项目文档，整理成可导入 DriveLab 的知识卡片 JSON。要求：1. 只依据原文和已给项目事实，不补造参数；2. 每张卡片一个知识点，问题明确，答案简洁，解释原理，补充真实工作场景和产品经理关注点；3. 明确标记通用原理、项目具体型号、项目测试数据、待核验内容；4. 保留来源文件名和章节；5. 不确定的数字标记“需核对”，不要写成确定结论；6. 输出严格 JSON，格式为 {"cards":[{"id":"new_001","category":"核心硬件","level":"入门","question":"...","answer":"...","explain":"...","example":"...","pmUse":"...","source":"文件名·章节","status":"参考知识","tags":["..."]}]}。不要输出 JSON 以外的解释。`;
function downloadJSON(filename,obj){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function exportData(){downloadJSON("DriveLab_学习备份_"+todayKey()+".json",appData);}
function importFile(){
  const inp=document.createElement("input");inp.type="file";inp.accept=".json,application/json";
  inp.onchange=async()=>{
    const f=inp.files?.[0];if(!f)return;
    try{
      const data=JSON.parse(await f.text());const incoming=Array.isArray(data)?data:(data.cards||[]);
      let added=0,updated=0;
      for(const c of incoming){
        if(!c.question||!c.answer)continue;
        const id=c.id||("imp_"+Date.now()+"_"+added);
        const idx=appData.cards.findIndex(x=>x.id===id||x.question.trim()===c.question.trim());
        const next={category:"项目实战",level:"入门",status:"待验证",tags:[],...c,id};
        if(idx>=0){appData.cards[idx]={...appData.cards[idx],...next};updated++;}
        else{appData.cards.push(next);added++;}
      }
      if(data.progress)appData.progress={...appData.progress,...data.progress};
      save();alert(`导入完成：新增 ${added} 张，更新 ${updated} 张。`);currentTab="library";render();
    }catch(e){alert("导入失败：请确认文件是有效的 JSON 卡片文件。");}
  };inp.click();
}
function copyPrompt(){
  const fallback=()=>{const t=document.createElement("textarea");t.value=importPrompt;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove();alert("制卡提示词已复制。");};
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(importPrompt).then(()=>alert("制卡提示词已复制。")).catch(fallback);else fallback();
}
function showAbout(){
  openModal("关于 DriveLab",`<p class="small-note" style="font-size:12px">DriveLab 是你的个人车载硬件与产品实战知识卡 App。当前版本包含约 80 张来自项目资料和工作讨论的卡片，支持间隔复习、搜索、分类、新增、JSON 导入和备份导出。</p><p class="small-note" style="font-size:12px">数据默认只保存在当前浏览器本地，不会自动上传。项目规格和测试数据会标注来源与核验状态。培训资料中的典型数值不应直接当作产品承诺。</p><button class="btn btn-primary" style="width:100%;margin-top:10px" data-action="close-modal">知道了</button>`);
}
document.addEventListener("click",e=>{
  const tab=e.target.closest("[data-tab]");if(tab){setTab(tab.dataset.tab);return;}
  const jump=e.target.closest("[data-tab-jump]");if(jump){setTab(jump.dataset.tabJump);return;}
  const cat=e.target.closest("[data-category-jump]");if(cat){activeCategory=cat.dataset.categoryJump;setTab("library");return;}
  const filter=e.target.closest("[data-filter]");if(filter){activeCategory=filter.dataset.filter;render();return;}
  const open=e.target.closest("[data-open-card]");if(open){openDetail(open.dataset.openCard);return;}
  const gradeBtn=e.target.closest("[data-grade]");if(gradeBtn){grade(gradeBtn.dataset.grade);return;}
  const act=e.target.closest("[data-action]");if(!act)return;
  const a=act.dataset.action;
  if(a==="start-study")startStudy();
  else if(a==="reveal")reveal();
  else if(a==="add-card")addCardModal();
  else if(a==="edit-card"){const c=appData.cards.find(x=>x.id===act.dataset.id);if(c)addCardModal(c);}
  else if(a==="import")importFile();
  else if(a==="export")exportData();
  else if(a==="copy-prompt")copyPrompt();
  else if(a==="close-modal"){if(e.target===act||act.classList.contains("close-btn")||act.tagName==="BUTTON")closeModal();}
  else if(a==="show-about")showAbout();
  else if(a==="back-library"){currentTab="library";setTab("library");}
  else if(a==="study-this"){const c=appData.cards.find(x=>x.id===act.dataset.id);studyQueue=[c];studyIndex=0;answerShown=false;setTab("study");}
});
document.addEventListener("input",e=>{
  if(e.target.id==="search-input"){const pos=e.target.selectionStart;searchText=e.target.value;const main=$("#main");const y=main.scrollTop;render();const input=$("#search-input");input?.focus();input?.setSelectionRange(pos,pos);}
});
init();
