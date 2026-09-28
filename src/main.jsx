import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const LS_KEY='guide-exhibits';
const seed=[
 {id:1,title:'潮汐之后',room:'A01 · 主展厅',type:'装置',desc:'一件记录海岸线变化的沉浸式影像装置。',audio:'https://example.com/audio.mp3',status:'已发布',color:'#e6b45d',rev:3,
  annotations:[
   {id:'a1',target:'desc',quote:'一件记录海岸线变化的沉浸式影像装置。',draftRev:1,text:'“沉浸式”建议补一句时长或体验方式，方便观众安排动线。',status:'resolved',createdAt:Date.now()-86400000*4,resolvedAt:Date.now()-86400000*2,recheckAtRev:null}
  ],
  snapshots:[
   {id:'s1',publishedAt:Date.now()-86400000*2,rev:3,title:'潮汐之后',room:'A01 · 主展厅',type:'装置',desc:'一件记录海岸线变化的沉浸式影像装置。',
    annotations:[
     {id:'a1',target:'desc',quote:'一件记录海岸线变化的沉浸式影像装置。',draftRev:1,text:'“沉浸式”建议补一句时长或体验方式，方便观众安排动线。',status:'resolved',createdAt:Date.now()-86400000*4,resolvedAt:Date.now()-86400000*2,recheckAtRev:null}
    ]}
  ]},
 {id:2,title:'未寄出的信',room:'B02 · 纸上时间',type:'档案',desc:'来自三代人的手写信件与声音档案。',audio:'',status:'草稿',color:'#ef8f84',rev:3,
  annotations:[
   {id:'a2',target:'title',quote:'一封未寄出的信',draftRev:2,text:'标题与铭牌不一致：铭牌上没有“一封”，请统一。',status:'recheck',createdAt:Date.now()-86400000*3,recheckAtRev:3,resolvedAt:null},
   {id:'a3',target:'desc',quote:'来自三代人的手写信件与声音档案。',draftRev:3,text:'“三代人”最好写明年份跨度，避免观众误解。',status:'open',createdAt:Date.now()-3600000*5,recheckAtRev:null,resolvedAt:null}
  ],
  snapshots:[]},
 {id:3,title:'柔软的边界',room:'C01 · 新媒介',type:'互动',desc:'观众的移动会改变墙面上的光影。',audio:'',status:'已发布',color:'#83b9b1',rev:1,annotations:[],snapshots:[]}
];
const migrate=x=>({rev:1,annotations:[],snapshots:[],...x});
const load=()=>{try{const raw=JSON.parse(localStorage.getItem(LS_KEY));if(Array.isArray(raw)&&raw.length)return raw.map(migrate)}catch{}return seed.map(x=>({...x,annotations:x.annotations.map(a=>({...a})),snapshots:x.snapshots.map(s=>({...s,annotations:s.annotations.map(a=>({...a}))}))}))};
const fmt=ts=>new Date(ts).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const fieldName=t=>t==='title'?'标题':'介绍';
const isBlocker=a=>a.status!=='resolved';
const order={recheck:0,open:1,resolved:2};

function ComposeBox({target,onCancel,onSave}){
 const [text,setText]=useState('');
 return <div className="compose">
  <textarea rows={2} autoFocus placeholder={`针对「${fieldName(target)}」的审校意见…（将记录当前原文与草稿版本）`} value={text} onChange={e=>setText(e.target.value)}/>
  <div className="compose-actions"><button className="secondary sm" onClick={onCancel}>取消</button><button className="primary sm" disabled={!text.trim()} onClick={()=>onSave(text.trim())}>保存批注</button></div>
 </div>;
}

function AnnoCard({a,current,onConfirm,onReopen}){
 const cur=current[a.target];
 return <div className={'anno-card '+a.status}>
  <div className="anno-head">
   <span className={'anno-badge '+a.status}>{a.status==='open'?'待处理':a.status==='recheck'?'待重新确认':'已处理'}</span>
   <b>{fieldName(a.target)}批注</b>
   <span className="rev-tag">批注时 · 草稿 v{a.draftRev}</span>
  </div>
  <div className="anno-quote"><small>批注时原文</small><p>{a.quote||<em>（空）</em>}</p></div>
  {a.status==='recheck'&&<div className="anno-current"><small>文案已改动{a.recheckAtRev?` · 现 v${a.recheckAtRev}`:''}，需重新确认</small><p>{cur||<em>（空）</em>}</p></div>}
  <p className="anno-text">{a.text}</p>
  <div className="anno-foot">
   <small>{fmt(a.createdAt)}{a.status==='resolved'&&a.resolvedAt?` · 已于 ${fmt(a.resolvedAt)} 确认`:''}</small>
   {a.status!=='resolved'
    ? <button className="primary sm" onClick={()=>onConfirm(a.id)}>确认已处理</button>
    : <button className="secondary sm" onClick={()=>onReopen(a.id)}>重新标记待处理</button>}
  </div>
 </div>;
}

function App(){
 const [exhibits,setExhibits]=useState(load);
 const [selected,setSelected]=useState(1);
 const [view,setView]=useState('edit');
 const [filter,setFilter]=useState('全部');
 const [form,setForm]=useState({title:'',room:'',type:'装置',desc:'',audio:''});
 const [notice,setNotice]=useState('');
 const [composing,setComposing]=useState(null);

 useEffect(()=>localStorage.setItem(LS_KEY,JSON.stringify(exhibits)),[exhibits]);
 useEffect(()=>setComposing(null),[selected]);

 const visible=useMemo(()=>filter==='全部'?exhibits:exhibits.filter(x=>x.status===filter),[exhibits,filter]);
 const current=exhibits.find(x=>x.id===selected)||exhibits[0];
 const blockers=current?(current.annotations||[]).filter(isBlocker):[];
 const pendingCount=x=>(x.annotations||[]).filter(isBlocker).length;

 // 标题/介绍改动：锚定该字段且原文已对不上的旧批注 -> 待重新确认；草稿版本仅在有批注因此失效时 +1
 const updateField=(k,v)=>setExhibits(prev=>prev.map(x=>{
  if(x.id!==current.id)return x;
  if(k!=='title'&&k!=='desc')return {...x,[k]:v};
  const newlyStale=(x.annotations||[]).some(a=>a.target===k&&a.quote!==v&&a.status!=='recheck');
  const rev=x.rev+(newlyStale?1:0);
  const annotations=(x.annotations||[]).map(a=>
   a.target===k&&a.quote!==v?{...a,status:'recheck',recheckAtRev:rev}:a);
  return {...x,[k]:v,rev,annotations};
 }));
 const update=(k,v)=>updateField(k,v);

 const addAnnotation=text=>{
  if(!composing)return;
  const anno={id:'n'+Date.now(),target:composing,quote:current[composing],draftRev:current.rev,text,status:'open',createdAt:Date.now(),recheckAtRev:null,resolvedAt:null};
  setExhibits(prev=>prev.map(x=>x.id===current.id?{...x,annotations:[...(x.annotations||[]),anno]}:x));
  setComposing(null);
  setNotice('批注已保存，已锚定当前原文与草稿 v'+current.rev);
 };
 const confirmAnno=id=>setExhibits(prev=>prev.map(x=>{
  if(x.id!==current.id)return x;
  return {...x,annotations:(x.annotations||[]).map(a=>a.id===id
   ?{...a,status:'resolved',quote:x[a.target],draftRev:x.rev,recheckAtRev:null,resolvedAt:Date.now()}
   :a)};
 }));
 const reopenAnno=id=>setExhibits(prev=>prev.map(x=>x.id===current.id
  ?{...x,annotations:(x.annotations||[]).map(a=>a.id===id?{...a,status:'open',resolvedAt:null}:a)}
  :x));

 // 发布：有待处理/待确认批注时入口关闭；发布成功把已处理批注随文案快照留档
 const publish=()=>{
  if(blockers.length){setNotice(`还有 ${blockers.length} 条批注待确认，暂不能发布（草稿已照常保存）`);return;}
  const snap={id:'p'+Date.now(),publishedAt:Date.now(),rev:current.rev,title:current.title,desc:current.desc,room:current.room,type:current.type,
   annotations:(current.annotations||[]).map(a=>({...a}))};
  setExhibits(prev=>prev.map(x=>x.id===current.id?{...x,status:'已发布',snapshots:[snap,...(x.snapshots||[])]}:x));
  setNotice('已发布：已处理批注与文案快照已留档');
 };
 // 撤回：只切状态，当前草稿与批注均不动，历史快照仍可查看
 const withdraw=()=>{
  setExhibits(prev=>prev.map(x=>x.id===current.id?{...x,status:'草稿'}:x));
  setNotice('已撤回发布：当前草稿未回退，发布留档仍可查看');
 };

 const add=()=>{
  if(!form.title.trim())return;
  const item={...form,id:Date.now(),status:'草稿',color:['#e6b45d','#ef8f84','#83b9b1','#9ba7dc'][exhibits.length%4],rev:1,annotations:[],snapshots:[]};
  setExhibits([...exhibits,item]);setSelected(item.id);
  setForm({title:'',room:'',type:'装置',desc:'',audio:''});
  setNotice('展项已保存为草稿');
 };
 const exportData=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(exhibits,null,2)],{type:'application/json'}));
  a.download='exhibition-guide.json';a.click();
  setNotice('已导出展项数据（含批注与发布留档）');
 };

 const sortedAnnos=current?[...(current.annotations||[])].sort((a,b)=>order[a.status]-order[b.status]||b.createdAt-a.createdAt):[];
 const counts=current?{open:current.annotations.filter(a=>a.status==='open').length,recheck:current.annotations.filter(a=>a.status==='recheck').length,resolved:current.annotations.filter(a=>a.status==='resolved').length}:{};

 if(view==='visitor') return <div className="visitor"><header><div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div><button className="ghost" onClick={()=>setView('edit')}>返回编辑</button></header><main className="visitor-main"><span className="eyebrow">VISITOR GUIDE / 2024</span><h1>沿着作品，<em>走进</em>另一种时间。</h1><p className="lead">当你靠近一件作品，它的故事就开始流动。选择一个展项开始探索。</p><div className="visitor-grid">{exhibits.filter(x=>x.status==='已发布').map(x=><article className="visitor-card" key={x.id} onClick={()=>{setSelected(x.id);setView('detail')}}><div className="art" style={{background:x.color}}><span>{String(x.id).padStart(2,'0')}</span><i>↗</i></div><div className="card-meta"><small>{x.room}</small><h3>{x.title}</h3><p>{x.desc}</p></div></article>)}</div></main></div>;
 if(view==='detail'&&current)return <div className="visitor"><header><div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div><button className="ghost" onClick={()=>setView('visitor')}>← 全部展项</button></header><main className="detail"><div className="detail-art" style={{background:current.color}}><span>{String(current.id).padStart(2,'0')}</span></div><div className="detail-copy"><span className="eyebrow">{current.room} / {current.type}</span><h1>{current.title}</h1><p>{current.desc}</p>{current.audio&&<button className="audio" onClick={()=>setNotice('正在播放导览音频…')}>▶ 播放语音导览</button>}<div className="qr"><div className="qr-box">▦</div><div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div></div></div></main>{notice&&<div className="toast">{notice}</div>}</div>;

 return <div className="app"><aside><div className="brand"><span className="mark">M</span><span>展览工作台</span></div><div className="side-label">当前项目</div><div className="project"><span className="project-dot"></span><div><strong>潮汐之后</strong><small>2024 春季展</small></div><span>⌄</span></div><nav><button className="active">▧ <span>展项内容</span><b>{exhibits.length}</b></button><button>⌁ <span>展厅动线</span></button><button>◉ <span>二维码</span></button></nav><div className="side-foot"><button>⚙ 设置</button><small>已自动保存 · 刚刚</small></div></aside>
 <main className="workspace">
  <header className="topbar">
   <div><span className="eyebrow">EXHIBITION BUILDER</span><h1>展项内容</h1></div>
   <div className="top-right">
    {current&&blockers.length>0&&<span className="gate-hint">⚠ {blockers.length} 条批注待确认，发布暂时关闭</span>}
    <div className="top-actions">
     <button className="secondary" onClick={exportData}>↓ 导出 JSON</button>
     <button className="secondary" onClick={()=>setView('visitor')}>◉ 访客预览</button>
     {current?.status==='已发布'
      ? <button className="primary" onClick={withdraw}>撤回发布 <span>↙</span></button>
      : <button className={'primary'+(blockers.length?' disabled':'')} onClick={publish} title={blockers.length?'批注全部确认后才能发布':''}>发布更新 <span>↗</span></button>}
    </div>
   </div>
  </header>
  <div className="content">
   <section className="list-pane">
    <div className="list-head"><div><h2>全部展项</h2><span>{exhibits.length} 个展项</span></div><button className="add-btn" onClick={()=>document.querySelector('.form-panel').scrollIntoView({behavior:'smooth'})}>＋ 添加展项</button></div>
    <div className="filters">{['全部','已发布','草稿'].map(x=><button className={filter===x?'selected':''} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div>
    <div className="exhibit-list">{visible.map(x=>{const n=pendingCount(x);return <button className={'exhibit-row '+(selected===x.id?'chosen':'')} key={x.id} onClick={()=>setSelected(x.id)}>
     <span className="thumb" style={{background:x.color}}>{String(x.id).padStart(2,'0')}</span>
     <span className="row-copy"><strong>{x.title}</strong><small>{x.room} · {x.type}</small></span>
     {n>0&&<span className="pending-badge">{n}</span>}
     <span className={'status '+(x.status==='已发布'?'live':'draft')}>{x.status}</span>
     <span className="chev">›</span>
    </button>;})}</div>
   </section>
   <section className="form-panel">
    <div className="panel-title">
     <div><span className="eyebrow">EDIT EXHIBIT</span><h2>编辑展项 <em className="rev-title">v{current?.rev ?? 1}</em></h2></div>
     <span className={'status '+(current?.status==='已发布'?'live':'draft')}>{current?.status}</span>
    </div>
    {current&&<div className="editor">
     <label>
      <span className="field-head">展项标题<button type="button" className="anno-btn" onClick={()=>setComposing(composing==='title'?null:'title')}>＋ 审校批注</button></span>
      <input value={current.title} onChange={e=>update('title',e.target.value)}/>
     </label>
     {composing==='title'&&<ComposeBox target="title" onCancel={()=>setComposing(null)} onSave={addAnnotation}/>}
     <div className="two"><label>所在展厅<input value={current.room} onChange={e=>update('room',e.target.value)}/></label><label>内容类型<select value={current.type} onChange={e=>update('type',e.target.value)}><option>装置</option><option>档案</option><option>互动</option><option>绘画</option></select></label></div>
     <label>
      <span className="field-head">展项介绍<button type="button" className="anno-btn" onClick={()=>setComposing(composing==='desc'?null:'desc')}>＋ 审校批注</button></span>
      <textarea rows="5" value={current.desc} onChange={e=>update('desc',e.target.value)}/>
     </label>
     {composing==='desc'&&<ComposeBox target="desc" onCancel={()=>setComposing(null)} onSave={addAnnotation}/>}
     <label>语音导览 URL<input value={current.audio} placeholder="https://…" onChange={e=>update('audio',e.target.value)}/><small className="hint">访客扫描二维码后可播放；改动不影响批注状态</small></label>

     <div className="anno-panel">
      <div className="anno-panel-head"><h3>审校批注</h3><span className="anno-counts">
       <i className="c-recheck">待重新确认 {counts.recheck}</i><i className="c-open">待处理 {counts.open}</i><i className="c-resolved">已处理 {counts.resolved}</i>
      </span></div>
      {sortedAnnos.length===0&&<p className="anno-empty">暂无批注。点标题或介绍旁的「＋ 审校批注」即可添加，批注会锚定当时原文与草稿版本。</p>}
      {sortedAnnos.map(a=><AnnoCard key={a.id} a={a} current={current} onConfirm={confirmAnno} onReopen={reopenAnno}/>)}
     </div>

     {(current.snapshots||[]).length>0&&<div className="archive-panel">
      <h3>发布留档 <small>撤回后仍可查看，当前草稿不会回退</small></h3>
      {current.snapshots.map(s=><details className="snapshot" key={s.id}>
       <summary><b>{fmt(s.publishedAt)} 发布</b><span>草稿 v{s.rev} · {s.annotations.length} 条已处理批注</span></summary>
       <div className="snap-body">
        <div className="snap-field"><small>标题</small><p>{s.title}</p></div>
        <div className="snap-field"><small>介绍</small><p>{s.desc}</p></div>
        <div className="snap-annos">{s.annotations.length===0
          ? <p className="anno-empty">本次发布时无批注。</p>
          : s.annotations.map(a=><div className="snap-anno" key={a.id}>
            <span className={'anno-badge '+a.status}>{fieldName(a.target)} · v{a.draftRev}</span>
            <div className="anno-quote"><small>批注时原文</small><p>{a.quote||<em>（空）</em>}</p></div>
            <p className="anno-text">{a.text}</p>
           </div>)}</div>
       </div>
      </details>)}
     </div>}

     <div className="preview-block"><div className="preview-heading"><span>二维码预览</span><button onClick={()=>setNotice('二维码链接已复制')}>复制链接</button></div><div className="qr-preview"><div className="qr-box big">▦</div><div><strong>展项-{String(current.id).padStart(3,'0')}</strong><small>/guide/{current.id}</small></div></div></div>
    </div>}
    <div className="new-form"><div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div><div className="two"><input placeholder="展项标题" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input placeholder="展厅编号" value={form.room} onChange={e=>setForm({...form,room:e.target.value})}/></div><textarea placeholder="一句话介绍…" rows="2" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}/><button className="primary full" onClick={add}>保存新展项</button></div>
   </section>
  </div>
 </main>
 {notice&&<div className="toast">{notice}</div>}
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
