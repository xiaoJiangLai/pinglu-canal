/* 平陆运河科普平台 —— 交互逻辑（依赖 data.js 中的 regionData / regionOrder / answerMap） */

const tabs = document.getElementById('regionTabs');

function renderTabs(){
  regionOrder.forEach((id,i)=>{
    const btn=document.createElement('button');
    btn.className='region-tab'+(i===0?' active':'');
    btn.textContent=regionData[id].title;
    btn.dataset.region=id;
    btn.addEventListener('click',()=>selectRegion(id,true));
    tabs.appendChild(btn);
  });
}

function selectRegion(id,scroll=false){
  const data=regionData[id];
  document.querySelectorAll('.region-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.region===id));
  document.querySelectorAll('.region-shape').forEach(shape=>{
    const active=shape.dataset.region===id;
    shape.classList.toggle('selected',active);
    shape.classList.toggle('dimmed',!active);
  });
  document.querySelectorAll('.node-group').forEach(node=>node.classList.toggle('active',data.nodes.includes(node.dataset.node)));
  document.getElementById('canalHighlight').classList.add('visible');

  document.getElementById('regionCode').textContent=data.code;
  document.getElementById('regionTitle').textContent=data.title;
  document.getElementById('regionRole').textContent=data.role;
  document.getElementById('regionOverview').textContent=data.overview;
  document.getElementById('storyTitle').textContent=data.storyTitle;
  document.getElementById('storyText').textContent=data.storyText;

  const facts=document.getElementById('regionFacts'); facts.innerHTML='';
  data.facts.forEach(([label,value])=>{facts.insertAdjacentHTML('beforeend',`<div class="fact"><small>${label}</small><strong>${value}</strong></div>`)});
  const tags=document.getElementById('regionTags'); tags.innerHTML='';
  data.tags.forEach(tag=>tags.insertAdjacentHTML('beforeend',`<span class="region-tag">${tag}</span>`));
  if(scroll) document.querySelector('#regions').scrollIntoView({behavior:'smooth',block:'start'});
}

document.querySelectorAll('.region-shape').forEach(shape=>shape.addEventListener('click',()=>selectRegion(shape.dataset.region,false)));
renderTabs(); selectRegion('hengzhou');

/* ===== AI 问答（接入 DeepSeek，经 Cloudflare Worker 中转） ===== */
const AI_ENDPOINT = 'https://pinglu-canal.vercel.app/api/chat'; // Vercel Serverless Function（国内可达性更优）

const aiAnswer = document.getElementById('aiAnswer');
const aiInput = document.getElementById('fakeInput');
const aiSend = document.getElementById('fakeSend');
const aiStatus = document.querySelector('.chat-status');

let chatHistory = []; // 保留对话历史 [{role, content}]

function askAI(question){
  const q = (question||'').trim();
  if(!q){ return; }

  // 清空输入框，追加用户气泡
  aiInput.value = '';
  aiAnswer.innerHTML = `<div class="chat-message user"><strong>你：</strong>${escapeHtml(q)}</div>`;
  aiStatus.textContent = '思考中…';

  const assistantBox = document.createElement('div');
  assistantBox.className = 'chat-message assistant';
  assistantBox.innerHTML = '<strong>助手：</strong><span class="ai-cursor"></span>';
  aiAnswer.appendChild(assistantBox);

  // 调用 Worker
  fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: q, history: chatHistory }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if(!res.ok){
        throw new Error(data.error || data.detail || ('接口错误 ' + res.status));
      }
      const answerText = data.answer || '';
      if(!answerText){
        throw new Error('未收到有效回复');
      }
      assistantBox.innerHTML = '<strong>助手：</strong>' + formatAnswer(answerText);
      aiStatus.textContent = '在线';
      chatHistory.push({ role:'user', content:q });
      chatHistory.push({ role:'assistant', content:answerText });
      if(chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
    })
    .catch((e)=>{
      assistantBox.innerHTML = '<strong>助手：</strong><span style="color:#ff9d8a">出错了：' + escapeHtml(e.message) + '</span>';
      aiStatus.textContent = '在线';
    });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function formatAnswer(text){
  // 1. 先做 HTML 转义防注入
  let html = escapeHtml(text);
  // 2. 解析 Markdown 加粗 **...**：用非贪婪配对，且不允许内部再有 **
  //    规则：** + 内容（不含 *）+ **
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 3. 解析单星斜体 *...*（同样排除内部含 * 的情况）
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // 4. 换行转 <br>
  html = html.replace(/\n/g, '<br>');
  return html;
}

// 示例问题按钮：直接用问题文本触发真实问答
document.querySelectorAll('.q-btn').forEach(btn=>btn.addEventListener('click',()=>{
  askAI(btn.dataset.question);
}));

aiSend.addEventListener('click',()=>askAI(aiInput.value));
aiInput.addEventListener('keydown',e=>{ if(e.key==='Enter') askAI(aiInput.value); });

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add('visible')}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

const sections=[...document.querySelectorAll('main section[id]')];
const navLinks=[...document.querySelectorAll('.nav a')];
window.addEventListener('scroll',()=>{
  const y=window.scrollY+120;
  let current='';
  sections.forEach(sec=>{if(sec.offsetTop<=y)current=sec.id});
  navLinks.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+current));
},{passive:true});

/* ===== 沿线全景关系图（手绘 SVG，不依赖真实底图） ===== */
function initCanalOverviewDiagram(){
  const diagram=document.querySelector('.canal-diagram');
  if(!diagram) return;

  const DATA={
    city:{
      nanning:    { tag:'城市 · 经济带', title:'南宁市', role:'运河起点 · 首府核心', stat:'6212.46 亿元<small>· 2025 GDP</small>', industries:['数字经济','科创服务','现代金融','新能源电池','精细化工新材料','茉莉花深加工'], desc:'源头门户、流域协同治理示范区、港产城融合先行样板；作为运河起点段，承担水质第一道防线、临港产业承载、城乡协同发展三重使命。' },
      qinzhou:    { tag:'城市 · 经济带', title:'钦州市', role:'运河入海口 · 滨海运河城市', stat:'1907.61 亿元<small>· 2025 GDP</small>', industries:['绿色化工','新材料','粮油食品加工','装备制造','海洋产业','江海联运'], desc:'江海联运枢纽、出海口门户、港产城融合示范；作为运河入海段，承担江海衔接、临港产业集聚、陆海通道联通功能。' },
      guigang:    { tag:'城市 · 经济带', title:'贵港市', role:'运河枢纽 · 西江中转（错位）', stat:'1628.44 亿元<small>· 2025 GDP</small>', industries:['木业家居','绿色化工','冶金建材','现代纸业','能源电力','富硒农业'], desc:'西江黄金水道重要节点、运河经济带内河中转枢纽；依托西江干线衔接平陆运河，承担内河中转、大宗货物集散功能。' },
      beihai:     { tag:'城市 · 经济带', title:'北海市', role:'向海经济 · 临港工业（错位）', stat:'1974.04 亿元<small>· 2025 GDP</small>', industries:['电子信息','绿色化工','硅基新材料','海工装备','滨海旅游','海洋渔业'], desc:'经济带外海远洋枢纽、临港产业配套高地；不直接位于运河主航道，立足错位发展，承接运河带来的西南内陆腹地货源。' },
      fangchenggang:{ tag:'城市 · 经济带', title:'防城港市', role:'临港工业 · 门户枢纽（错位）', stat:'1201.26 亿元<small>· 2025 GDP</small>', industries:['先进钢铁','有色金属','新型能源','新材料','面向东盟口岸贸易','海洋渔业'], desc:'西部陆海新通道重要配套枢纽、沿海沿边临港产业高地；以江海联运衔接、大宗商品中转为核心，承接运河内陆货源。' }
    },
    county:{
      hengzhou:{ tag:'县区 · 主航道', title:'横州市', role:'西江之畔 · 运河起点', stat:'起点城市', desc:'运河从西津库区平塘江口出发，在这里与西江航运体系衔接，开启从珠江水系向北部湾的新航程。' },
      lingshan:{ tag:'县区 · 主航道', title:'灵山县', role:'穿越分水岭的工程核心区', stat:'穿岭核心区', desc:'运河在灵山进入最具工程张力的穿岭区域，重点联系沙坪、旧州、陆屋等地。马道和企石两大梯级枢纽均位于这一核心区。' },
      qinbei:   { tag:'县区 · 主航道', title:'钦北区', role:'运河进入钦江腹地', stat:'钦江中游', desc:'从穿岭工程段向南，运河逐渐进入钦江中下游的乡镇与河谷空间，是讲「运河与人」关系的典型区域。' },
      qinnan:   { tag:'县区 · 主航道', title:'钦南区', role:'江海在这里相遇', stat:'江海门户', desc:'进入钦南区后，空间叙事从河谷转向城市、河口、海湾与港口。青年枢纽、钦州城区、茅尾海和钦州港共同构成运河最终入海的连续画面。' }
    },
    hub:{
      madao:   { tag:'枢纽 · 梯级', title:'马道枢纽', role:'最大运行水头', stat:'29.6<small>m</small>', desc:'第一梯级，最大运行水头 29.6m，高水头省水船闸是整条运河最具代表性的工程名片之一。' },
      qishi:   { tag:'枢纽 · 梯级', title:'企石枢纽', role:'最大运行水头', stat:'27<small>m</small>', desc:'第二梯级，最大运行水头约 27m，采用三级省水池。' },
      qingnian:{ tag:'枢纽 · 梯级', title:'青年枢纽', role:'最大运行水头', stat:'10.32<small>m</small>', desc:'第三梯级，也是进入钦州城区与海湾前的最后一级「水上电梯」，最大运行水头 10.32m。' }
    },
    node:{
      pingtang:{ tag:'节点 · 起点', title:'平塘江口', role:'西江 → 运河起点', stat:'', desc:'运河从西津库区平塘江口启程，与西江航运体系衔接。' },
      maowei:  { tag:'节点 · 入海', title:'茅尾海', role:'入海口近海段', stat:'', desc:'经茅尾海与钦州港航道衔接，是江海联运的交接段。' },
      qinzhougang:{ tag:'节点 · 入海', title:'钦州港', role:'北部湾 · 出海口', stat:'', desc:'运河最终接入钦州港东航道，直入北部湾。' }
    }
  };

  const infoCard=document.getElementById('canalInfoCard');
  function showInfo(d){
    document.getElementById('coTag').textContent=d.tag;
    document.getElementById('coTitle').textContent=d.title;
    document.getElementById('coRole').textContent=d.role||'';
    document.getElementById('coStat').innerHTML=d.stat||'';
    const ib=document.getElementById('coIndustriesBlock'), db=document.getElementById('coDescBlock');
    if(d.industries){ ib.style.display='block'; document.getElementById('coIndustries').innerHTML=d.industries.map(i=>'<span>'+i+'</span>').join(''); } else ib.style.display='none';
    if(d.desc){ db.style.display='block'; document.getElementById('coDesc').textContent=d.desc; } else db.style.display='none';
    infoCard.style.display='block';
  }
  function hideInfo(){ infoCard.style.display='none'; }

  // 绑定点击
  diagram.querySelectorAll('[data-key]').forEach(el=>{
    el.style.cursor='pointer';
    el.addEventListener('click',e=>{
      e.stopPropagation();
      const key=el.dataset.key;
      const d=DATA.city[key]||DATA.county[key]||DATA.hub[key]||DATA.node[key];
      if(d) showInfo(d);
    });
  });
  document.getElementById('canalInfoClose').addEventListener('click',hideInfo);

  // 快捷查看 Tab（城市）
  const tabs=document.getElementById('coTabs');
  const cityKeys=['nanning','qinzhou','guigang','beihai','fangchenggang'];
  cityKeys.forEach(k=>{
    const b=document.createElement('button'); b.className='com-tab'; b.textContent=DATA.city[k].title.replace('市','');
    b.addEventListener('click',()=>showInfo(DATA.city[k]));
    tabs.appendChild(b);
  });

  // 默认选中一个示例，避免信息卡空白
  showInfo(DATA.city.nanning);
}
if(document.querySelector('.canal-diagram')){ initCanalOverviewDiagram(); }

/* ===== 沿线全景关系图 弹窗控制 ===== */
(function(){
  const modal=document.getElementById('canalModal');
  const trigger=document.getElementById('canalTrigger');
  if(!modal || !trigger) return;

  const body=document.body;
  function openModal(){
    modal.hidden=false;
    body.style.overflow='hidden';
    trigger.setAttribute('aria-expanded','true');
    const focusable=modal.querySelector('.modal-close');
    if(focusable) setTimeout(()=>focusable.focus(),50);
  }
  function closeModal(){
    modal.hidden=true;
    body.style.overflow='';
    trigger.setAttribute('aria-expanded','false');
    trigger.focus();
  }

  trigger.addEventListener('click',openModal);
  modal.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',closeModal));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && !modal.hidden) closeModal();
  });
})();
