/* 投稿カレンダー：いつ・どの動画を・どこに投稿したかを月ごとに表示する */
(() => {
  'use strict';

  const DEFAULT_PLAT = [
    ['story', 'インスタ ストーリーズ', 'ストーリーズ', '#e4407b'],
    ['reel', 'インスタ リール', 'リール', '#f08a4b'],
    ['tiktok', 'TikTok', 'TikTok', '#3cc8d8'],
    ['yt', 'YouTube ショート', 'YouTube', '#e5463b'],
  ];
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  const NEAR_DAYS = 7;   // 前後何日以内の重複を注意するか
  const MAX_DOTS = 4;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const dayDiff = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
  const md = s => { const d = parse(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : s; };

  const A = () => window.ANAN || {};
  const plat = () => (Array.isArray(A().PLAT) && A().PLAT.length ? A().PLAT : DEFAULT_PLAT);

  function readPosts() {
    try { if (typeof A().posts === 'function') return A().posts() || {}; } catch (e) { /* 下で読み直す */ }
    try { return JSON.parse(localStorage.getItem('anan-posts') || '{}') || {}; } catch (e) { return {}; }
  }
  function readItems() {
    try { return typeof A().items === 'function' ? (A().items() || []) : []; } catch (e) { return []; }
  }

  // 状態
  let el = null;
  let view = null;        // 表示中の月（1日）
  let selected = '';      // 選択中の日 YYYY-MM-DD
  let byDate = {};        // { 日付: [{id, plat}] }
  let byId = {};          // { 動画id: [{date, plat}] }
  let itemMap = {};
  let total = 0;

  function load() {
    const posts = readPosts();
    const keys = plat().map(p => p[0]);
    byDate = {}; byId = {}; total = 0;
    itemMap = {};
    readItems().forEach(it => { if (it && it.id != null) itemMap[it.id] = it; });
    Object.keys(posts || {}).forEach(id => {
      const rec = posts[id];
      if (!rec || typeof rec !== 'object') return;
      keys.forEach(k => {
        const date = rec[k];
        if (!parse(date)) return;      // "old" や "unknown" などは出さない
        (byDate[date] = byDate[date] || []).push({ id, plat: k });
        (byId[id] = byId[id] || []).push({ date, plat: k });
        total++;
      });
    });
  }

  function build() {
    el = document.createElement('section');
    el.className = 'sheet grid-sheet cal-sheet';
    el.id = 'cal';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '投稿カレンダー');
    el.innerHTML = `
      <div class="sheet-head">
        <h2>投稿カレンダー</h2>
        <button class="close cal-close" type="button" aria-label="閉じる">×</button>
      </div>
      <div class="cal-nav">
        <button class="cal-arrow" type="button" data-cal-move="-1" aria-label="前の月">‹</button>
        <b class="cal-month" aria-live="polite"></b>
        <button class="cal-arrow" type="button" data-cal-move="1" aria-label="次の月">›</button>
        <button class="cal-today" type="button" data-cal-today>今日</button>
      </div>
      <div class="cal-legend"></div>
      <div class="cal-week">${WEEK.map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
      <div class="cal-grid" role="grid"></div>
      <div class="cal-note" hidden></div>
      <div class="cal-day"></div>`;
    document.body.appendChild(el);

    el.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('.cal-close')) { close(); return; }
      const mv = t.closest('[data-cal-move]');
      if (mv) { move(+mv.dataset.calMove); return; }
      if (t.closest('[data-cal-today]')) { goToday(); return; }
      const d = t.closest('[data-date]');
      if (d) { select(d.dataset.date); return; }
      const j = t.closest('[data-cal-jump]');
      if (j) { jump(j.dataset.calJump); }
    });

    // app.js の矢印・Esc 処理より先に受け取る
    window.addEventListener('keydown', e => {
      if (!el || el.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); e.stopImmediatePropagation(); move(e.key === 'ArrowLeft' ? -1 : 1); return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.stopImmediatePropagation(); // 裏のフィードを動かさない
    }, true);
  }

  function render() {
    const P = plat();
    const color = {}; const short = {};
    P.forEach(p => { color[p[0]] = p[3]; short[p[0]] = p[2]; });
    const y = view.getFullYear(); const m = view.getMonth();
    const today = ymd(new Date());
    const prefix = `${y}-${pad(m + 1)}-`;

    el.querySelector('.cal-month').textContent = `${y}年${m + 1}月`;

    // 投稿先ごとの件数（この月）
    const count = {}; P.forEach(p => { count[p[0]] = 0; });
    Object.keys(byDate).forEach(d => { if (d.startsWith(prefix)) byDate[d].forEach(x => { count[x.plat]++; }); });
    const monthTotal = Object.values(count).reduce((a, b) => a + b, 0);
    el.querySelector('.cal-legend').innerHTML =
      P.map(p => `<span class="cal-lg"><i style="background:${esc(p[3])}"></i>${esc(p[2])}<b>${count[p[0]]}</b></span>`).join('') +
      `<span class="cal-lg cal-lg-total">今月 計<b>${monthTotal}</b>件</span>`;

    // マス目
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span class="cal-cell cal-blank" aria-hidden="true"></span>');
    for (let d = 1; d <= days; d++) {
      const date = prefix + pad(d);
      const dow = (first + d - 1) % 7;
      const list = byDate[date] || [];
      const order = P.map(p => p[0]);
      const sorted = list.slice().sort((a, b) => order.indexOf(a.plat) - order.indexOf(b.plat));
      const dots = sorted.slice(0, MAX_DOTS).map(x => `<i style="background:${esc(color[x.plat] || '#888')}"></i>`).join('');
      const more = sorted.length > MAX_DOTS ? `<em>+${sorted.length - MAX_DOTS}</em>` : '';
      const cls = ['cal-cell'];
      if (dow === 0) cls.push('sun');
      if (dow === 6) cls.push('sat');
      if (date === today) cls.push('is-today');
      if (date === selected) cls.push('is-sel');
      if (list.length) cls.push('has');
      const label = `${m + 1}月${d}日${date === today ? '（今日）' : ''} 投稿${list.length}件`;
      cells.push(`<button type="button" class="${cls.join(' ')}" data-date="${date}" aria-label="${label}" aria-pressed="${date === selected}">
        <span class="cal-d">${d}</span><span class="cal-dots">${dots}${more}</span></button>`);
    }
    el.querySelector('.cal-grid').innerHTML = cells.join('');

    const note = el.querySelector('.cal-note');
    if (!total) {
      note.hidden = false;
      note.textContent = 'まだ投稿の記録がありません。動画の『投稿記録』ボタンから記録できます';
    } else { note.hidden = true; note.textContent = ''; }

    renderDay(color, short);
  }

  function renderDay(color, short) {
    const box = el.querySelector('.cal-day');
    if (!selected) { box.innerHTML = ''; return; }
    const d = parse(selected);
    const title = `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）の投稿`;
    const list = byDate[selected] || [];
    if (!list.length) {
      box.innerHTML = `<h3>${esc(title)}</h3>${total ? '<p class="cal-none">この日の投稿はありません</p>' : ''}`;
      return;
    }
    // 同じ動画は1行にまとめる
    const rows = []; const seen = {};
    list.forEach(x => {
      if (!seen[x.id]) { seen[x.id] = { id: x.id, plats: [] }; rows.push(seen[x.id]); }
      seen[x.id].plats.push(x.plat);
    });
    const order = plat().map(p => p[0]);
    box.innerHTML = `<h3>${esc(title)}<small>${rows.length}本</small></h3>` + rows.map(r => {
      const it = itemMap[r.id] || { id: r.id, title: r.id };
      const sub = [it.series, it.num != null && it.num !== '' ? `#${it.num}` : ''].filter(Boolean).join(' ');
      const tags = r.plats.sort((a, b) => order.indexOf(a) - order.indexOf(b))
        .map(k => `<span class="cal-tag" style="--c:${esc(color[k] || '#888')}">${esc(short[k] || k)}</span>`).join('');
      // 前後7日以内のほかの日の投稿
      const near = {};
      (byId[r.id] || []).forEach(p => {
        if (p.date === selected) return;
        const diff = Math.abs(dayDiff(p.date, selected));
        if (diff <= NEAR_DAYS) near[p.date] = diff;
      });
      const warn = Object.keys(near).sort().map(dt => `<span class="cal-warn">⚠ ${md(dt)}にも投稿（${near[dt]}日差）</span>`).join('');
      const img = it.poster ? `<img src="${esc(it.poster)}" alt="" loading="lazy">` : '<span class="cal-noimg"></span>';
      return `<button type="button" class="cal-row" data-cal-jump="${esc(r.id)}" aria-label="${esc(it.title)} を再生">
        ${img}
        <span class="cal-info">
          <b class="cal-title">${esc(it.title)}</b>
          ${sub ? `<span class="cal-sub">${esc(sub)}</span>` : ''}
          <span class="cal-tags">${tags}</span>
          ${warn}
        </span>
        <span class="cal-go" aria-hidden="true">›</span>
      </button>`;
    }).join('');
  }

  function move(n) {
    view = new Date(view.getFullYear(), view.getMonth() + n, 1);
    render();
  }
  function goToday() {
    const t = new Date();
    view = new Date(t.getFullYear(), t.getMonth(), 1);
    selected = ymd(t);
    render();
  }
  function select(date) {
    selected = date;
    render();
    const box = el.querySelector('.cal-day');
    if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function jump(id) {
    close();   // onClose → jump の順で同期的に呼ぶ（jump 側で目的の動画を再生）
    try { if (typeof A().jump === 'function') A().jump(id); } catch (e) { /* 無視 */ }
  }

  function open() {
    if (!el) build();
    load();
    const t = new Date();
    view = new Date(t.getFullYear(), t.getMonth(), 1);
    selected = ymd(t);
    render();
    el.hidden = false;
    el.scrollTop = 0;
  }

  function close() {
    if (!el || el.hidden) return;
    el.hidden = true;
    try { if (typeof A().onClose === 'function') A().onClose(); } catch (e) { /* 無視 */ }
  }

  window.ANAN_CAL = { open, close };
})();
