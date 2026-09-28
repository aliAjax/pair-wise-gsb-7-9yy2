import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

/* ---------- 批注状态：锚定原文 + 当时草稿版本，状态机在批注本身之上 ---------- */
const ANNO = {
  open: { key: 'open', label: '待处理' },
  stale: { key: 'stale', label: '待重新确认' },
  done: { key: 'done', label: '已处理' },
};

const seed = [
  {
    id: 1, title: '潮汐之后', room: 'A01 · 主展厅', type: '装置',
    desc: '一件记录海岸线变化的沉浸式影像装置。',
    audio: 'https://example.com/audio.mp3',
    status: '已发布', version: 3, updatedAt: Date.now() - 86400000 * 6, color: '#e6b45d',
    annotations: [
      {
        id: 'a1', field: 'title', text: '标题确认与海报一致，可定稿。', author: '校对 · 林',
        createdAt: Date.now() - 86400000 * 8,
        quote: '潮汐之后', quoteVersion: 2,
        status: 'done',
        confirmedAt: Date.now() - 86400000 * 6, confirmedVersion: 3,
      },
    ],
    publications: [
      {
        id: 'p1', version: 3, publishedAt: Date.now() - 86400000 * 6,
        snapshot: {
          title: '潮汐之后', room: 'A01 · 主展厅', type: '装置',
          desc: '一件记录海岸线变化的沉浸式影像装置。',
        },
        resolvedAnnotations: [
          {
            id: 'a1', field: 'title', text: '标题确认与海报一致，可定稿。', author: '校对 · 林',
            quote: '潮汐之后', quoteVersion: 2, status: 'done', confirmedVersion: 3,
          },
        ],
      },
    ],
  },
  {
    id: 2, title: '未寄出的信', room: 'B02 · 纸上时间', type: '档案',
    desc: '来自三代人的手写信件与声音档案，按时间线铺陈在展柜中。',
    audio: '',
    status: '草稿', version: 3, updatedAt: Date.now() - 3600000 * 5, color: '#ef8f84',
    annotations: [
      {
        id: 'a2', field: 'title', text: '副标题里的「寄出」是否与作品名统一？', author: '编辑 · 周',
        createdAt: Date.now() - 3600000 * 9,
        quote: '未寄出的信', quoteVersion: 3, status: 'open',
      },
      {
        id: 'a3', field: 'desc', text: '介绍里补上展陈形式，观众才知道现场看什么。', author: '策展 · 何',
        createdAt: Date.now() - 86400000 * 2,
        quote: '来自三代人的手写信件与声音档案。', quoteVersion: 2,
        status: 'stale', confirmedAt: Date.now() - 3600000 * 8, confirmedVersion: 2,
      },
    ],
    publications: [],
  },
  {
    id: 3, title: '柔软的边界', room: 'C01 · 新媒介', type: '互动',
    desc: '观众的移动会改变墙面上的光影。',
    audio: '',
    status: '已发布', version: 1, updatedAt: Date.now() - 86400000 * 20, color: '#83b9b1',
    annotations: [], publications: [],
  },
];

const STORAGE_KEY = 'guide-exhibits-v2';
const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* 沿用种子数据 */ }
  return seed;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtTime = (t) => {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fieldName = (f) => (f === 'title' ? '标题' : '介绍');

/** 有效状态：记录是 stale，或原文已与当前文案不符（文案被动过） */
function effectiveStatus(a, item) {
  if (a.status === 'done' && a.quote === item[a.field]) return 'done';
  if (a.status === 'stale' || (a.status === 'done' && a.quote !== item[a.field])) return 'stale';
  return 'open';
}
const pendingCount = (item) =>
  item.annotations.reduce((n, a) => n + (effectiveStatus(a, item) !== 'done' ? 1 : 0), 0);

function App() {
  const [exhibits, setExhibits] = useState(load);
  const [selected, setSelected] = useState(1);
  const [view, setView] = useState('edit');
  const [filter, setFilter] = useState('全部');
  const [form, setForm] = useState({ title: '', room: '', type: '装置', desc: '', audio: '' });
  const [notice, setNotice] = useState('');
  const [annoTab, setAnnoTab] = useState('全部');
  const [composer, setComposer] = useState(null); // { field, text }
  const [viewingPub, setViewingPub] = useState(null); // publication id
  const bumpTimer = useRef(null);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(exhibits)), [exhibits]);
  useEffect(() => { setAnnoTab('全部'); setComposer(null); }, [selected]);

  const visible = useMemo(
    () => (filter === '全部' ? exhibits : exhibits.filter((x) => x.status === filter)),
    [exhibits, filter],
  );
  const current = exhibits.find((x) => x.id === selected) || exhibits[0];

  const patch = (id, fn) => setExhibits((list) => list.map((x) => (x.id === id ? fn(x) : x)));

  /* 标题/介绍改动：草稿照常保存；该字段上已处理/旧批注落到“待重新确认”；版本号在停顿后 +1 */
  const editField = (field, value) => {
    const item = current;
    if (bumpTimer.current) clearTimeout(bumpTimer.current);
    const fromVersion = item.version;
    patch(item.id, (x) => ({
      ...x,
      [field]: value,
      updatedAt: Date.now(),
      annotations: x.annotations.map((a) => {
        if (a.field !== field) return a;
        if (a.status === 'done' && a.quote === x[field]) return { ...a, status: 'stale' };
        return a;
      }),
    }));
    bumpTimer.current = setTimeout(() => {
      setExhibits((list) => list.map((x) =>
        x.id === item.id && x.version === fromVersion && (x.title !== item.title || x.desc !== item.desc)
          ? { ...x, version: x.version + 1 }
          : x));
    }, 1000);
  };
  const updateMeta = (k, v) => patch(current.id, (x) => ({ ...x, [k]: v }));

  /* ---------- 批注操作 ---------- */
  const addAnnotation = () => {
    if (!composer || !composer.text.trim()) return;
    const { field, text } = composer;
    patch(current.id, (x) => ({
      ...x,
      annotations: [...x.annotations, {
        id: uid(), field, text: text.trim(), author: '校对 · 我',
        createdAt: Date.now(),
        quote: x[field], quoteVersion: x.version, status: 'open',
      }],
    }));
    setComposer(null);
    setNotice('批注已添加，并记下指向的原文与草稿版本');
  };
  const resolveAnno = (aid) =>
    patch(current.id, (x) => ({
      ...x,
      annotations: x.annotations.map((a) => (a.id === aid ? { ...a, status: 'done' } : a)),
    }));
  const reconfirmAnno = (aid) =>
    patch(current.id, (x) => ({
      ...x,
      annotations: x.annotations.map((a) => (a.id === aid ? {
        ...a,
        status: 'done',
        quote: x[a.field], quoteVersion: x.version,
        confirmedAt: Date.now(), confirmedVersion: x.version,
      } : a)),
    }));
  const reopenAnno = (aid) =>
    patch(current.id, (x) => ({
      ...x,
      annotations: x.annotations.map((a) => (a.id === aid ? { ...a, status: 'open' } : a)),
    }));
  const deleteAnno = (aid) =>
    patch(current.id, (x) => ({ ...x, annotations: x.annotations.filter((a) => a.id !== aid) }));

  /* ---------- 发布 / 撤回 ---------- */
  const add = () => {
    if (!form.title.trim()) return;
    const item = {
      ...form, id: Date.now(), status: '草稿', version: 1, updatedAt: Date.now(),
      color: ['#e6b45d', '#ef8f84', '#83b9b1', '#9ba7dc'][exhibits.length % 4],
      annotations: [], publications: [],
    };
    setExhibits([...exhibits, item]);
    setSelected(item.id);
    setForm({ title: '', room: '', type: '装置', desc: '', audio: '' });
    setNotice('展项已保存为草稿');
  };

  const publish = () => {
    if (pendingCount(current) > 0) return; // 有待确认批注，发布入口关闭
    patch(current.id, (x) => ({
      ...x,
      status: '已发布',
      publications: [{
        id: uid(),
        version: x.version,
        publishedAt: Date.now(),
        snapshot: { title: x.title, room: x.room, type: x.type, desc: x.desc },
        resolvedAnnotations: x.annotations
          .filter((a) => effectiveStatus(a, x) === 'done')
          .map((a) => ({
            id: a.id, field: a.field, text: a.text, author: a.author,
            quote: a.quote, quoteVersion: a.quoteVersion,
            status: a.status, confirmedVersion: a.confirmedVersion ?? null,
          })),
      }, ...x.publications],
    }));
    setNotice('已发布：已处理批注与文案快照已留档');
  };
  // 撤回：仅状态回到草稿，当前草稿不回退，历史快照保留
  const unpublish = () => {
    patch(current.id, (x) => ({ ...x, status: '草稿' }));
    setNotice('已撤回发布；发布留档仍可查看，当前草稿未回退');
  };

  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(exhibits, null, 2)], { type: 'application/json' }));
    a.download = 'exhibition-guide.json';
    a.click();
    setNotice('已导出展项数据（含批注与发布留档）');
  };

  const viewedPublication = viewingPub
    ? exhibits.flatMap((x) => x.publications.map((p) => ({ ...p, exhibit: x })))
      .find((p) => p.id === viewingPub)
    : null;

  /* ---------- 访客视图（保持原样） ---------- */
  if (view === 'visitor') return (
    <div className="visitor">
      <header>
        <div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div>
        <button className="ghost" onClick={() => setView('edit')}>返回编辑</button>
      </header>
      <main className="visitor-main">
        <span className="eyebrow">VISITOR GUIDE / 2024</span>
        <h1>沿着作品，<em>走进</em>另一种时间。</h1>
        <p className="lead">当你靠近一件作品，它的故事就开始流动。选择一个展项开始探索。</p>
        <div className="visitor-grid">
          {exhibits.filter((x) => x.status === '已发布').map((x) => (
            <article className="visitor-card" key={x.id} onClick={() => { setSelected(x.id); setView('detail'); }}>
              <div className="art" style={{ background: x.color }}><span>{String(x.id).padStart(2, '0')}</span><i>↗</i></div>
              <div className="card-meta"><small>{x.room}</small><h3>{x.title}</h3><p>{x.desc}</p></div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
  if (view === 'detail' && current) return (
    <div className="visitor">
      <header>
        <div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div>
        <button className="ghost" onClick={() => setView('visitor')}>← 全部展项</button>
      </header>
      <main className="detail">
        <div className="detail-art" style={{ background: current.color }}><span>{String(current.id).padStart(2, '0')}</span></div>
        <div className="detail-copy">
          <span className="eyebrow">{current.room} / {current.type}</span>
          <h1>{current.title}</h1>
          <p>{current.desc}</p>
          {current.audio && <button className="audio" onClick={() => setNotice('正在播放导览音频…')}>▶ 播放语音导览</button>}
          <div className="qr"><div className="qr-box">▦</div><div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div></div>
        </div>
      </main>
      {notice && <div className="toast">{notice}</div>}
    </div>
  );

  /* ---------- 编辑工作台 ---------- */
  const annos = current?.annotations ?? [];
  const withState = annos.map((a) => ({ a, state: effectiveStatus(a, current) }));
  const counts = {
    全部: withState.length,
    待处理: withState.filter((x) => x.state === 'open').length,
    待重新确认: withState.filter((x) => x.state === 'stale').length,
    已处理: withState.filter((x) => x.state === 'done').length,
  };
  const shown = withState.filter((x) => annoTab === '全部' || ANNO[x.state].label === annoTab);
  const pending = current ? pendingCount(current) : 0;

  const fieldWithAdd = (label, field, node) => (
    <label>
      <span className="field-head">
        {label}
        <button
          type="button" className="add-anno"
          onClick={() => setComposer({ field, text: '' })}
        >＋ 添加{fieldName(field)}批注</button>
      </span>
      {node}
    </label>
  );

  return (
    <div className="app">
      <aside>
        <div className="brand"><span className="mark">M</span><span>展览工作台</span></div>
        <div className="side-label">当前项目</div>
        <div className="project">
          <span className="project-dot"></span>
          <div><strong>潮汐之后</strong><small>2024 春季展</small></div>
          <span>⌄</span>
        </div>
        <nav>
          <button className="active">▧ <span>展项内容</span><b>{exhibits.length}</b></button>
          <button>⌁ <span>展厅动线</span></button>
          <button>◉ <span>二维码</span></button>
        </nav>
        <div className="side-foot">
          <button>⚙ 设置</button>
          <small>已自动保存 · 刚刚</small>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">EXHIBITION BUILDER</span>
            <h1>展项内容</h1>
          </div>
          <div className="top-actions">
            <button className="secondary" onClick={exportData}>↓ 导出 JSON</button>
            <button className="secondary" onClick={() => setView('visitor')}>◉ 访客预览</button>
            {current.status === '已发布' ? (
              <button className="primary" onClick={unpublish}>撤回发布 <span>↙</span></button>
            ) : (
              <button
                className="primary" disabled={pending > 0}
                title={pending > 0 ? `还有 ${pending} 条待确认批注，发布入口暂关` : '全部批注已处理，可以发布'}
                onClick={publish}
              >发布更新 <span>↗</span></button>
            )}
          </div>
        </header>
        {current.status !== '已发布' && pending > 0 && (
          <div className="publish-note">⚠ 还有 {pending} 条待确认批注，发布入口暂时关闭；草稿仍会照常保存。</div>
        )}

        <div className="content">
          <section className="list-pane">
            <div className="list-head">
              <div><h2>全部展项</h2><span>{exhibits.length} 个展项</span></div>
              <button className="add-btn" onClick={() => document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth' })}>＋ 添加展项</button>
            </div>
            <div className="filters">
              {['全部', '已发布', '草稿'].map((x) => (
                <button className={filter === x ? 'selected' : ''} onClick={() => setFilter(x)} key={x}>{x}</button>
              ))}
            </div>
            <div className="exhibit-list">
              {visible.map((x) => {
                const p = x.status === '草稿' ? pendingCount(x) : 0;
                return (
                  <button className={'exhibit-row ' + (selected === x.id ? 'chosen' : '')} key={x.id} onClick={() => setSelected(x.id)}>
                    <span className="thumb" style={{ background: x.color }}>{String(x.id).padStart(2, '0')}</span>
                    <span className="row-copy"><strong>{x.title}</strong><small>{x.room} · {x.type}</small></span>
                    {p > 0 && <span className="pending-badge" title="待确认批注">{p} 待确认</span>}
                    <span className={'status ' + (x.status === '已发布' ? 'live' : 'draft')}>{x.status}</span>
                    <span className="chev">›</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="form-panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">EDIT EXHIBIT</span>
                <h2>编辑展项</h2>
              </div>
              <div className="title-right">
                <span className="version-chip">草稿 v{current.version}</span>
                <span className={'status ' + (current.status === '已发布' ? 'live' : 'draft')}>{current.status}</span>
              </div>
            </div>

            {current && (
              <div className="editor">
                {fieldWithAdd('展项标题', 'title',
                  <input value={current.title} onChange={(e) => editField('title', e.target.value)} />)}
                <div className="two">
                  <label>所在展厅<input value={current.room} onChange={(e) => updateMeta('room', e.target.value)} /></label>
                  <label>内容类型
                    <select value={current.type} onChange={(e) => updateMeta('type', e.target.value)}>
                      <option>装置</option><option>档案</option><option>互动</option><option>绘画</option>
                    </select>
                  </label>
                </div>
                {fieldWithAdd('展项介绍', 'desc',
                  <textarea rows="5" value={current.desc} onChange={(e) => editField('desc', e.target.value)} />)}
                <label>语音导览 URL
                  <input value={current.audio} placeholder="https://…" onChange={(e) => updateMeta('audio', e.target.value)} />
                  <small className="hint">访客扫描二维码后可播放</small>
                </label>

                {/* 审校批注 */}
                <div className="anno-section">
                  <div className="anno-head">
                    <h3>审校批注 <span className="anno-count">{annos.length}</span></h3>
                    <div className="anno-tabs">
                      {['全部', '待处理', '待重新确认', '已处理'].map((t) => (
                        <button key={t} className={annoTab === t ? 'selected' : ''} onClick={() => setAnnoTab(t)}>
                          {t} {counts[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {pending > 0 && current.status !== '已发布' && (
                    <div className="anno-banner">文案已改动，旧批注需逐条重新确认后才能发布。</div>
                  )}

                  {composer && (
                    <div className="composer">
                      <div className="composer-title">新增批注 · 锚定{fieldName(composer.field)}
                        <small>将记录当前原文与草稿 v{current.version}</small>
                      </div>
                      <textarea rows="2" placeholder="写下校对意见，例如：标题与海报字样不一致"
                        value={composer.text} autoFocus
                        onChange={(e) => setComposer({ ...composer, text: e.target.value })} />
                      <div className="composer-actions">
                        <button onClick={() => setComposer(null)}>取消</button>
                        <button className="primary" disabled={!composer.text.trim()} onClick={addAnnotation}>添加批注</button>
                      </div>
                    </div>
                  )}

                  {shown.length === 0 && <div className="anno-empty">该分类下暂无批注</div>}
                  {shown.map(({ a, state }) => (
                    <div key={a.id} className={'anno-card ' + state}>
                      <div className="anno-top">
                        <span className={'anno-pill ' + state}>{ANNO[state].label}</span>
                        <span className="anno-meta">{a.author} · {fmtTime(a.createdAt)}</span>
                        <button className="anno-del" title="删除批注" onClick={() => deleteAnno(a.id)}>✕</button>
                      </div>
                      <p className="anno-text">{a.text}</p>
                      <div className="anno-quote">
                        <span className="quote-tag">指向{fieldName(a.field)} · 草稿 v{a.quoteVersion} 原文</span>
                        <q>{a.quote}</q>
                        {state === 'stale' && (
                          <div className="quote-diff">
                            <span>现文：</span><q className="now">{current[a.field] || '（已清空）'}</q>
                          </div>
                        )}
                      </div>
                      {a.confirmedAt && (
                        <div className="anno-reconfirmed">
                          {state === 'stale'
                            ? `曾于 ${fmtTime(a.confirmedAt)}（v${a.confirmedVersion}）确认，文案此后又被改动`
                            : `已于 ${fmtTime(a.confirmedAt)} 按草稿 v${a.confirmedVersion} 重新确认`}
                        </div>
                      )}
                      <div className="anno-actions">
                        {state === 'open' && <button onClick={() => resolveAnno(a.id)}>✓ 标记已处理</button>}
                        {state === 'stale' && <button className="primary" onClick={() => reconfirmAnno(a.id)}>↻ 对照现文重新确认</button>}
                        {state === 'done' && <button onClick={() => reopenAnno(a.id)}>↺ 重新打开</button>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 发布留档：撤回后仍可查看快照 */}
                <div className="archive-section">
                  <div className="anno-head"><h3>发布留档</h3><span className="archive-count">共 {current.publications.length} 次发布</span></div>
                  {current.publications.length === 0 && <div className="anno-empty">尚未发布过，发布成功后会在此留存文案快照与已处理批注。</div>}
                  {current.publications.map((p) => (
                    <div key={p.id} className="archive-row">
                      <div className="archive-main">
                        <strong>v{p.version} 发布版</strong>
                        <small>{fmtTime(p.publishedAt)} · 留档批注 {p.resolvedAnnotations.length} 条</small>
                      </div>
                      <button className="archive-view" onClick={() => setViewingPub(p.id)}>查看快照</button>
                    </div>
                  ))}
                </div>

                <div className="preview-block">
                  <div className="preview-heading">
                    <span>二维码预览</span>
                    <button onClick={() => setNotice('二维码链接已复制')}>复制链接</button>
                  </div>
                  <div className="qr-preview">
                    <div className="qr-box big">▦</div>
                    <div><strong>展项-{String(current.id).padStart(3, '0')}</strong><small>/guide/{current.id}</small></div>
                  </div>
                </div>
              </div>
            )}

            <div className="new-form">
              <div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div>
              <div className="two">
                <input placeholder="展项标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <input placeholder="展厅编号" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
              </div>
              <textarea placeholder="一句话介绍…" rows="2" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
              <button className="primary full" onClick={add}>保存新展项</button>
            </div>
          </section>
        </div>
      </main>

      {viewedPublication && (
        <div className="modal-mask" onClick={() => setViewingPub(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">PUBLISHED SNAPSHOT</span>
                <h2>《{viewedPublication.exhibit.title}》v{viewedPublication.version} 发布留档</h2>
                <small>发布时间 {fmtTime(viewedPublication.publishedAt)} · 只读快照，撤回与后续编辑均不会改动它</small>
              </div>
              <button className="anno-del" onClick={() => setViewingPub(null)}>✕</button>
            </div>
            <div className="snapshot-grid">
              <div>
                <span className="quote-tag">标题</span>
                <h3>{viewedPublication.snapshot.title}</h3>
                <span className="quote-tag">{viewedPublication.snapshot.room} · {viewedPublication.snapshot.type}</span>
              </div>
              <div>
                <span className="quote-tag">介绍</span>
                <p className="snapshot-desc">{viewedPublication.snapshot.desc}</p>
              </div>
            </div>
            <div className="snapshot-annos">
              <strong>随版留档批注（{viewedPublication.resolvedAnnotations.length}）</strong>
              {viewedPublication.resolvedAnnotations.length === 0 && <div className="anno-empty">本次发布没有已处理批注。</div>}
              {viewedPublication.resolvedAnnotations.map((a) => (
                <div key={a.id} className="archive-anno">
                  <span className={'anno-pill done'}>已处理</span>
                  <div>
                    <p>{a.text}</p>
                    <small>{a.author} · 指向{fieldName(a.field)}草稿 v{a.quoteVersion}原文：<q>{a.quote}</q></small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
