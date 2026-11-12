(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const feed = $('#feed');
  const chipsEl = $('#chips');
  const UA = navigator.userAgent;
  const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IS_ANDROID = /Android/.test(UA);

  const ICON = {
    save: '<svg viewBox="0 0 24 24"><path d="M12 3a1 1 0 0 1 1 1v9.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.4L11 13.6V4a1 1 0 0 1 1-1zM5 19h14a1 1 0 1 1 0 2H5a1 1 0 1 1 0-2z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12a1 1 0 1 0-1.4 1.4l4.9 4.9a1 1 0 0 0 1.4 0L20.1 8.4A1 1 0 1 0 18.7 7l-9.2 9.2z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7z"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 2.6 7.3 7.3l1.4 1.4L11 6.4V15h2V6.4l2.3 2.3 1.4-1.4L12 2.6zM5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9h-2v9H7v-9H5z"/></svg>',
  };

  // ---- 状態 ----
  let DATA = { series: [], items: [] };
  let filter = 'all';
  let list = [];
  let muted = true;
  let current = null;           // いま見えているスライド
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const posted = new Set(store.get('anan-posted', []));
  const savePosted = () => store.set('anan-posted', [...posted]);

  const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const fmtMB = b => `${(b / 1048576).toFixed(1)}MB`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---- 絞り込み ----
  function renderChips() {
    const c = { all: DATA.items.length, todo: DATA.items.filter(i => !posted.has(i.id)).length, done: 0 };
    c.done = c.all - c.todo;
    const defs = [['all', 'すべて', c.all], ['todo', '未投稿', c.todo]];
    for (const s of DATA.series) defs.push([`s:${s}`, s, DATA.items.filter(i => i.series === s).length]);
    defs.push(['done', '投稿済み', c.done]);
    chipsEl.innerHTML = defs.map(([k, l, n]) =>
      `<button class="chip" data-filter="${esc(k)}" aria-pressed="${filter === k}">${esc(l)}<span class="n">${n}</span></button>`).join('');
  }
  function applyFilter() {
    list = DATA.items.filter(i =>
      filter === 'all' ? true :
      filter === 'todo' ? !posted.has(i.id) :
      filter === 'done' ? posted.has(i.id) :
      i.series === filter.slice(2));
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    store.set('anan-filter', filter);
    renderAll();
    feed.scrollTop = 0;
  });

  // ---- フィード ----
  function slideHTML(it, idx) {
    const tags = [`<span class="tag series">${esc(it.series)}${it.num ? ' ' + esc(it.num) : ''}</span>`];
    if (it.variants.some(v => v.label === 'BGMなし')) tags.push('<span class="tag">BGMなし版あり</span>');
    if (posted.has(it.id)) tags.push('<span class="tag posted">投稿済み</span>');
    return `
    <article class="slide is-paused" data-idx="${idx}" data-id="${it.id}">
      <img class="bg" src="${esc(it.poster)}" alt="" loading="${idx < 2 ? 'eager' : 'lazy'}">
      <img class="poster" src="${esc(it.poster)}" alt="" loading="${idx < 2 ? 'eager' : 'lazy'}">
      <video playsinline webkit-playsinline loop muted preload="none" data-src="${esc(it.preview)}"></video>
      <div class="shade"></div>
      <div class="tap" aria-hidden="true"></div>
      <div class="paused-ico">${ICON.play}</div>
      <div class="meta">
        <div class="tags">${tags.join('')}</div>
        <h3>${esc(it.title)}</h3>
        <div class="sub">${fmtDur(it.dur)}・縦${it.w}×${it.h}・${idx + 1}/${list.length}</div>
      </div>
      <div class="actions">
        <button class="act sound" aria-label="音のオン・オフ"><span class="ic">${muted ? ICON.mute : ICON.sound}</span><span class="t">${muted ? '音なし' : '音あり'}</span></button>
        <button class="act done-btn ${posted.has(it.id) ? 'done' : ''}" aria-label="投稿済みにする"><span class="ic">${ICON.check}</span><span class="t">${posted.has(it.id) ? '投稿済み' : '未投稿'}</span></button>
        <button class="act save" aria-label="保存して使う"><span class="ic">${ICON.save}</span><span>保存して使う</span></button>
      </div>
      <div class="progress"><i></i></div>
    </article>`;
  }

  let io;
  function renderAll() {
    applyFilter();
    renderChips();
    pauseAll();
    feed.innerHTML = list.map(slideHTML).join('');
    $('#empty').hidden = list.length > 0;
    current = null;
    io?.disconnect();
    io = new IntersectionObserver(onIntersect, { root: feed, threshold: [0, .6] });
    feed.querySelectorAll('.slide').forEach(s => io.observe(s));
    renderGrid();
  }

  function onIntersect(entries) {
    for (const e of entries) {
      if (e.intersectionRatio >= .6) activate(e.target);
    }
  }

  function ensureSrc(slide) {
    if (!slide) return;
    const v = $('video', slide);
    if (!v.getAttribute('src')) { v.src = v.dataset.src; v.preload = 'auto'; }
  }
  function unload(slide) {
    const v = $('video', slide);
    if (v.getAttribute('src')) { v.pause(); v.removeAttribute('src'); v.load(); slide.classList.remove('playing'); }
  }
  function pauseAll() { feed.querySelectorAll('video').forEach(v => v.pause()); }

  function activate(slide) {
    if (current === slide) return;
    current = slide;
    const idx = +slide.dataset.idx;
    const slides = feed.querySelectorAll('.slide');
    slides.forEach((s, i) => {
      if (Math.abs(i - idx) <= 1) ensureSrc(s);
      else if (Math.abs(i - idx) > 2) unload(s);
      if (s !== slide) { $('video', s).pause(); s.classList.add('is-paused'); }
    });
    play(slide);
  }

  function play(slide) {
    const v = $('video', slide);
    ensureSrc(slide);
    v.muted = muted;
    const p = v.play();
    slide.classList.remove('is-paused');
    if (p) p.catch(() => {
      if (!v.muted) { v.muted = true; muted = true; syncSoundButtons(); return v.play().catch(() => slide.classList.add('is-paused')); }
      slide.classList.add('is-paused');
    });
  }

  function syncSoundButtons() {
    feed.querySelectorAll('.act.sound').forEach(b => {
      $('.ic', b).innerHTML = muted ? ICON.mute : ICON.sound;
      $('.t', b).textContent = muted ? '音なし' : '音あり';
    });
  }

  feed.addEventListener('playing', e => e.target.closest('.slide')?.classList.add('playing'), true);
  feed.addEventListener('timeupdate', e => {
    const v = e.target, s = v.closest('.slide');
    if (s && v.duration) $('.progress i', s).style.width = `${(v.currentTime / v.duration) * 100}%`;
  }, true);

  feed.addEventListener('click', e => {
    const slide = e.target.closest('.slide');
    if (!slide) return;
    const it = list[+slide.dataset.idx];
    if (e.target.closest('.act.save')) return openSave(it);
    if (e.target.closest('.act.sound')) {
      muted = !muted;
      const v = $('video', slide); v.muted = muted;
      if (v.paused) play(slide);
      syncSoundButtons();
      toast(muted ? '音を消しました' : '音を出します', 1200);
      return;
    }
    if (e.target.closest('.done-btn')) return togglePosted(it, slide);
    if (e.target.closest('.tap')) {
      const v = $('video', slide);
      if (v.paused) play(slide); else { v.pause(); slide.classList.add('is-paused'); }
    }
  });

  function togglePosted(it, slide) {
    if (posted.has(it.id)) posted.delete(it.id); else posted.add(it.id);
    savePosted();
    const on = posted.has(it.id);
    if (slide) {
      const b = $('.done-btn', slide);
      b.classList.toggle('done', on);
      $('.t', b).textContent = on ? '投稿済み' : '未投稿';
      const tags = $('.tags', slide);
      tags.querySelector('.posted')?.remove();
      if (on) tags.insertAdjacentHTML('beforeend', '<span class="tag posted">投稿済み</span>');
    }
    renderChips();
    renderGrid();
    toast(on ? '投稿済みにしました' : '未投稿に戻しました', 1400);
  }

  // キーボード（PC確認用）
  document.addEventListener('keydown', e => {
    if (!$('#save').hidden || !$('#grid').hidden) { if (e.key === 'Escape') closeSheets(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      feed.scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * feed.clientHeight, behavior: 'smooth' });
    }
  });

  // ---- 一覧 ----
  function renderGrid() {
    $('#gridCount').textContent = `${list.length}本`;
    $('#gridList').innerHTML = list.map((it, i) => `
      <button class="cell" data-jump="${i}" aria-label="${esc(it.title)}">
        <img src="${esc(it.poster)}" alt="" loading="lazy">
        <span class="badge">${esc(it.series)}${it.num ? ' ' + esc(it.num) : ''}</span>
        ${posted.has(it.id) ? '<span class="chk">✓</span>' : ''}
        <span class="lbl">${esc(it.title)}</span>
      </button>`).join('');
  }
  $('#openGrid').addEventListener('click', () => { pauseAll(); $('#grid').hidden = false; });
  $('#gridList').addEventListener('click', e => {
    const c = e.target.closest('[data-jump]');
    if (!c) return;
    $('#grid').hidden = true;
    const s = feed.children[+c.dataset.jump];
    current = null;
    feed.scrollTo({ top: s.offsetTop, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    activate(s);
  });

  // ---- 保存 ----
  let saveCtl = null;           // ダウンロード中の中断用
  let readyFile = null;         // 共有メニューに渡すファイル

  function closeSheets() {
    $('#save').hidden = true; $('#backdrop').hidden = true; $('#grid').hidden = true;
    saveCtl?.abort(); saveCtl = null; readyFile = null;
    if (current) play(current);
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.id === 'backdrop') closeSheets(); });

  const canShareFiles = (() => {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.mp4', { type: 'video/mp4' })] })); }
    catch { return false; }
  })();
  // iPhone は共有メニュー→「ビデオを保存」で写真アプリへ。Android・PC は普通のダウンロードが確実。
  const PREFER_SHARE = (IS_IOS && canShareFiles) || /[?&]ios=1/.test(location.search); // ?ios=1 はPCでiPhoneの動きを確かめる用

  function openSave(it) {
    pauseAll();
    readyFile = null;
    $('#saveTitle').textContent = it.title;
    $('#saveRes').textContent = `${it.w}×${it.h}`;
    $('#saveOptions').innerHTML = it.variants.map((v, i) => `
      <div class="opt" data-v="${i}">
        <div class="opt-head"><b>${esc(v.label)}</b><span>${fmtMB(v.bytes)}・${fmtDur(it.dur)}</span></div>
        <p>${esc(v.note)}${v.audio ? '' : '（音声なし）'}</p>
        <button class="btn go"><span class="bar"></span>${ICON.save}<span class="lab">${PREFER_SHARE ? '写真に保存する' : '端末に保存する'}</span></button>
        ${PREFER_SHARE ? '<button class="sub-link dl">ファイルとして保存（「ファイル」アプリへ）</button>' : (canShareFiles ? '<button class="sub-link sh">共有メニューで送る（LINE・ドライブなど）</button>' : '')}
      </div>`).join('');
    $('#howto').innerHTML = PREFER_SHARE
      ? '押すと動画を読み込み、ボタンが白くなります。もう一度押すと共有メニューが開くので<b>「ビデオを保存」</b>を選ぶと写真アプリに入ります。'
      : IS_ANDROID
        ? '保存した動画は「ダウンロード」フォルダに入り、ギャラリーやフォトアプリから投稿に使えます。'
        : '保存した動画はパソコンの「ダウンロード」フォルダに入ります。';
    $('#save').dataset.id = it.id;
    $('#backdrop').hidden = false; $('#save').hidden = false;
    $('#save')._item = it;
  }

  $('#saveOptions').addEventListener('click', async e => {
    const opt = e.target.closest('.opt');
    if (!opt) return;
    const it = $('#save')._item;
    const v = it.variants[+opt.dataset.v];
    const btn = $('.go', opt);

    // 2回目のタップ：読み込み済みなら共有メニューを開く（iPhoneはタップ直後でないと開けないため2段階）
    if (e.target.closest('.go') && btn.classList.contains('ready') && readyFile) {
      try {
        await navigator.share({ files: [readyFile], title: it.title });
        markSaved(btn, it);
      } catch (err) {
        if (err.name !== 'AbortError') { toast('共有メニューを開けませんでした。下の「ファイルとして保存」を試してください', 4000); }
      }
      return;
    }

    const mode = e.target.closest('.go') ? (PREFER_SHARE ? 'share' : 'download')
      : e.target.closest('.dl') ? 'download'
      : e.target.closest('.sh') ? 'share' : null;
    if (!mode) return;

    if (mode === 'download' && !e.target.closest('.go')) {
      // 「ファイルとして保存」はそのままリンクで保存（読み込み待ちなし）
      directDownload(v);
      return;
    }

    if (btn.disabled) return;
    saveCtl?.abort();
    saveCtl = new AbortController();
    btn.disabled = true;
    const lab = $('.lab', btn), bar = $('.bar', btn);
    lab.textContent = '読み込み中… 0%';
    try {
      const blob = await fetchWithProgress(v.src, saveCtl.signal, p => {
        bar.style.width = `${p * 100}%`; lab.textContent = `読み込み中… ${Math.round(p * 100)}%`;
      });
      const file = new File([blob], v.filename, { type: 'video/mp4' });
      btn.disabled = false; bar.style.width = '0';
      if (mode === 'download') {
        saveBlob(blob, v.filename);
        markSaved(btn, it);
      } else {
        readyFile = file;
        btn.classList.add('ready');
        btn.querySelector('svg').outerHTML = ICON.share;
        lab.textContent = 'もう一度押して保存（共有メニュー）';
        if (e.target.closest('.sh')) {
          // Android等：読み込み直後でも共有できる端末はそのまま開く
          try { await navigator.share({ files: [file], title: it.title }); markSaved(btn, it); } catch {}
        }
      }
    } catch (err) {
      btn.disabled = false; bar.style.width = '0';
      lab.textContent = PREFER_SHARE ? '写真に保存する' : '端末に保存する';
      if (err.name !== 'AbortError') toast('読み込みに失敗しました。電波の良い所でもう一度お試しください', 4000);
    }
  });

  function markSaved(btn, it) {
    btn.classList.remove('ready'); btn.classList.add('okd');
    btn.querySelector('svg').outerHTML = ICON.check;
    $('.lab', btn).textContent = '保存しました';
    if (!posted.has(it.id)) {
      const opt = btn.closest('.opt');
      if (!opt.querySelector('.mk')) {
        opt.insertAdjacentHTML('beforeend', '<button class="sub-link mk">投稿したら「投稿済み」にする</button>');
        opt.querySelector('.mk').addEventListener('click', ev => {
          ev.stopPropagation();
          const slide = feed.querySelector(`.slide[data-id="${it.id}"]`);
          if (!posted.has(it.id)) togglePosted(it, slide);
          ev.target.remove();
        });
      }
    }
  }

  async function fetchWithProgress(url, signal, onp) {
    const res = await fetch(url, { signal, cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = +res.headers.get('content-length') || 0;
    if (!res.body || !total) return res.blob();
    const reader = res.body.getReader();
    const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; onp(Math.min(got / total, 1));
    }
    return new Blob(chunks, { type: 'video/mp4' });
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('保存しました');
  }
  function directDownload(v) {
    const a = Object.assign(document.createElement('a'), { href: v.src, download: v.filename });
    document.body.appendChild(a); a.click(); a.remove();
    toast('保存を開始しました');
  }

  // ---- 起動 ----
  fetch('videos.json', { cache: 'no-cache' })
    .then(r => r.json())
    .then(d => {
      DATA = d;
      const f = store.get('anan-filter', 'all');
      filter = (f === 'all' || f === 'todo' || f === 'done' || DATA.series.includes(f.slice(2))) ? f : 'all';
      renderAll();
    })
    .catch(() => { feed.innerHTML = '<p style="padding:120px 20px;text-align:center">動画一覧を読み込めませんでした。再読み込みしてください。</p>'; });
})();
