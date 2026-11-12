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
    phone: '<svg viewBox="0 0 24 24"><path d="M8 1.5h8A2.5 2.5 0 0 1 18.5 4v16a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 20V4A2.5 2.5 0 0 1 8 1.5zm0 2a.5.5 0 0 0-.5.5v16c0 .3.2.5.5.5h8c.3 0 .5-.2.5-.5V4a.5.5 0 0 0-.5-.5h-1.3l-.4.8h-3.6l-.4-.8H8zm2.3 6.2 4.6 2.8-4.6 2.8V9.7z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 2.6 7.3 7.3l1.4 1.4L11 6.4V15h2V6.4l2.3 2.3 1.4-1.4L12 2.6zM5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9h-2v9H7v-9H5z"/></svg>',
  };

  // ---- 状態 ----
  let DATA = { series: [], items: [] };
  let filter = 'all';
  let genre = '';               // ジャンルの絞り込み（'' は全部）
  let list = [];
  let muted = true;   // 起動時に保存済みの設定を読む（下の store 定義後）
  let current = null;           // いま見えているスライド
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const posted = new Set(store.get('anan-posted', []));
  const savePosted = () => store.set('anan-posted', [...posted]);
  muted = store.get('anan-muted', true) !== false;

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
  const inGenre = i => !genre || i.genre === genre;
  function renderChips() {
    const base = DATA.items.filter(inGenre);
    const c = { all: base.length, todo: base.filter(i => !posted.has(i.id)).length, done: 0 };
    c.done = c.all - c.todo;
    const defs = [['all', 'すべて', c.all], ['todo', '未投稿', c.todo]];
    for (const s of DATA.series) defs.push([`s:${s}`, s, base.filter(i => i.series === s).length]);
    defs.push(['done', '投稿済み', c.done]);
    chipsEl.innerHTML = (genre ? `<button class="chip genre-chip" data-genre-clear aria-label="ジャンルの絞り込みを解除">${esc(genre)}<span class="x">×</span></button>` : '') +
      defs.map(([k, l, n]) =>
      `<button class="chip" data-filter="${esc(k)}" aria-pressed="${filter === k}">${esc(l)}<span class="n">${n}</span></button>`).join('');
    renderGenreSelect();
  }
  // 一覧のジャンル選択（プルダウン）
  function renderGenreSelect() {
    const sel = $('#gridGenre');
    const gs = DATA.genres || [];
    sel.innerHTML = `<option value="">すべてのジャンル（${DATA.items.length}）</option>` +
      gs.map(g => `<option value="${esc(g)}">${esc(g)}（${DATA.items.filter(i => i.genre === g).length}）</option>`).join('');
    sel.value = genre;
    sel.classList.toggle('on', !!genre);
  }
  function setGenre(g) {
    genre = g; store.set('anan-genre', g);
    renderAll();
    feed.scrollTop = 0;
  }
  $('#gridGenre').addEventListener('change', e => setGenre(e.target.value));
  document.addEventListener('click', e => { if (e.target.closest('[data-genre-clear]')) setGenre(''); });
  function applyFilter() {
    list = DATA.items.filter(inGenre).filter(i =>
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
        <button class="act igp" aria-label="インスタでの見え方"><span class="ic">${ICON.phone}</span><span>インスタ表示</span></button>
        <button class="act save" aria-label="保存して使う"><span class="ic">${ICON.save}</span><span>保存して使う</span></button>
      </div>
      <div class="seek" aria-label="再生位置（指で動かせます）"><span class="seek-time"></span><div class="progress"><i><b></b></i></div></div>
    </article>`;
  }

  let io;
  function renderAll() {
    applyFilter();
    renderChips();
    pauseAll();
    pool.forEach(v => { v.remove(); v._idx = -1; });
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

  // ---- 動画プレーヤーは3つだけを使い回す ----
  // iPhoneのSafariは「音ありの自動再生」をプレーヤー1つずつにしか許可しないため、
  // 動画ごとに新しいプレーヤーを作ると、許可のないプレーヤーで音が消えてしまう。
  // 3つを使い回し、画面に触れたときに3つまとめて許可を取る。
  const pool = [0, 1, 2].map(() => {
    const v = document.createElement('video');
    v.playsInline = true; v.loop = true; v.muted = true; v.preload = 'auto';
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v._idx = -1;
    return v;
  });
  let needUnlock = true;      // まだ音の許可を取っていない

  // どこを触っても（絞り込み・一覧・ボタン）許可を取る
  document.addEventListener('click', () => unlockPlayers(), true);

  function slideAt(i) { return feed.children[i]; }
  function playerFor(slide) { return pool[+slide.dataset.idx % 3]; }

  function attach(i) {
    const s = slideAt(i);
    if (!s || !s.classList.contains('slide')) return;
    const v = pool[i % 3];
    if (v._idx === i && v.parentNode === s) return;
    const old = v._idx >= 0 && slideAt(v._idx);
    if (old) old.classList.remove('playing');
    v.pause();
    v._idx = i;
    v.muted = true;
    v.src = list[i].preview;
    $('.poster', s).after(v);
    $('.progress i', s).style.width = '0';
  }
  function pauseAll() { pool.forEach(v => v.pause()); }

  // 画面に触れたとき（ユーザー操作の中）に、3つのプレーヤー全部の音の許可を取る
  function unlockPlayers() {
    if (!needUnlock) return;
    needUnlock = false;
    const cur = current && playerFor(current);
    if (cur && !cur.paused) { const p0 = cur.play(); if (p0) p0.catch(() => {}); }   // 再生中のものも操作の中で許可を取る
    pool.forEach(v => {
      if (v === cur) return;
      const wasMuted = v.muted;
      v.muted = false;
      const p = v.play();
      v.pause();
      v.muted = wasMuted;
      if (p) p.catch(() => {});
    });
  }

  function activate(slide) {
    if (current === slide) return;
    current = slide;
    const idx = +slide.dataset.idx;
    attach(idx); attach(idx + 1); attach(idx - 1);
    pool.forEach(v => { if (v._idx !== idx) { v.pause(); } });
    feed.querySelectorAll('.slide:not(.is-paused)').forEach(s => { if (s !== slide) s.classList.add('is-paused'); });
    play(slide);
  }

  function play(slide) {
    if (!$('#ig').hidden || !$('#grid').hidden) return;   // インスタ表示・一覧の表示中は裏で流さない
    const v = playerFor(slide);
    if (v._idx !== +slide.dataset.idx) attach(+slide.dataset.idx);
    v.muted = muted;
    const p = v.play();
    slide.classList.remove('is-paused');
    if (p) p.catch(err => {
      if (err && err.name === 'AbortError') return;
      if (!v.muted) {
        // 音ありが許可されなかった：設定は「音あり」のまま、いったん音なしで流す
        needUnlock = true;
        v.muted = true;
        v.play().catch(() => slide.classList.add('is-paused'));
        toast('画面をタップすると音が出ます', 2200);
        return;
      }
      slide.classList.add('is-paused');
    });
  }

  function syncSoundButtons() {
    feed.querySelectorAll('.act.sound').forEach(b => {
      $('.ic', b).innerHTML = muted ? ICON.mute : ICON.sound;
      $('.t', b).textContent = muted ? '音なし' : '音あり';
    });
  }

  feed.addEventListener('playing', e => {
    const v = e.target; const s = v._idx >= 0 && slideAt(v._idx);
    if (s && v.parentNode === s) s.classList.add('playing');
  }, true);
  feed.addEventListener('timeupdate', e => {
    const v = e.target, s = v.closest('.slide');
    if (seeking && seeking.v === v) return;   // 指で動かしている間は上書きしない
    if (s && v.duration) $('.progress i', s).style.width = `${(v.currentTime / v.duration) * 100}%`;
  }, true);

  // ---- 再生バーを指で動かす（戻す・進める） ----
  let seeking = null;
  function seekTo(e) {
    const { sk, v } = seeking;
    const r = sk.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const t = p * v.duration;
    seeking.t = t;
    if (Math.abs(v.currentTime - t) > 0.04) v.currentTime = t;
    $('.progress i', sk).style.width = `${p * 100}%`;
    const lab = $('.seek-time', sk);
    lab.textContent = `${fmtDur(t)} / ${fmtDur(v.duration)}`;
    lab.style.left = `${Math.min(Math.max(p * 100, 12), 88)}%`;
  }
  feed.addEventListener('pointerdown', e => {
    const sk = e.target.closest('.seek');
    if (!sk) return;
    const slide = sk.closest('.slide');
    const v = playerFor(slide);
    if (v._idx !== +slide.dataset.idx || !v.duration) return;
    e.preventDefault();
    try { sk.setPointerCapture(e.pointerId); } catch {}
    seeking = { sk, slide, v, wasPaused: v.paused };
    v.pause();
    sk.classList.add('drag');
    seekTo(e);
  });
  feed.addEventListener('pointermove', e => { if (seeking) { e.preventDefault(); seekTo(e); } });
  const endSeek = () => {
    if (!seeking) return;
    const { sk, slide, wasPaused } = seeking;
    seeking = null;
    sk.classList.remove('drag');
    if (!wasPaused) play(slide);
  };
  feed.addEventListener('pointerup', endSeek);
  feed.addEventListener('pointercancel', endSeek);

  feed.addEventListener('click', e => {
    const slide = e.target.closest('.slide');
    if (!slide) return;
    const it = list[+slide.dataset.idx];
    if (e.target.closest('.act.save')) return openSave(it);
    if (e.target.closest('.act.igp')) return openIG(it, playerFor(slide));
    if (e.target.closest('.act.sound')) {
      muted = !muted;
      store.set('anan-muted', muted);
      const v = playerFor(slide); v.muted = muted;
      if (v.paused) play(slide);
      unlockPlayers();
      syncSoundButtons();
      toast(muted ? '音を消しました' : '音を出します', 1200);
      return;
    }
    if (e.target.closest('.done-btn')) { unlockPlayers(); return togglePosted(it, slide); }
    if (e.target.closest('.tap')) {
      const v = playerFor(slide);
      if (!muted && v.muted && !v.paused) {
        // 音ありのはずが音なしで流れている → タップで音を出す（止めない）
        v.muted = false;
        const p1 = v.play(); if (p1) p1.catch(() => {});
        toast('音を出します', 1000);
        return;
      }
      unlockPlayers();
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
    if (!$('#ig').hidden && $('#save').hidden && igMode !== 'grid' && /^Arrow/.test(e.key)) {
      e.preventDefault(); igGo(e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1); return;
    }
    if (!$('#save').hidden || !$('#grid').hidden || !$('#ig').hidden) { if (e.key === 'Escape') closeSheets(); return; }
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

  // ---- インスタでの見え方 ----
  const igV = document.createElement('video');
  igV.playsInline = true; igV.loop = true; igV.muted = true; igV.preload = 'auto';
  igV.setAttribute('playsinline', ''); igV.setAttribute('webkit-playsinline', '');
  $('#igMedia').prepend(igV);
  const IG_NOTE = {
    story: 'ストーリーズ：上の名前の帯と、下の「メッセージを送信」付近に重なる所は見えにくくなります。スワイプで次の動画へ。',
    reel: 'リール：下の名前・説明文・音源の表示と、右のボタン列が動画に重なります。大事な文字は真ん中寄りに。上へスワイプで次の動画へ。',
    grid: 'プロフィール：一覧では上下が切れて縦3:横4で並びます（赤い枠がこの動画）。表紙はサムネ画像です。',
  };
  let igMode = store.get('anan-igmode', 'story');
  if (!IG_NOTE[igMode]) igMode = 'story';

  function igSetMode(m) {
    igMode = m; store.set('anan-igmode', m);
    $('#igScreen').dataset.mode = m;
    document.querySelectorAll('[data-ig]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ig === m)));
    $('#igNote').textContent = IG_NOTE[m];
    $('#igSafeChk').closest('label').hidden = m === 'grid';
    $('#igSound').hidden = m === 'grid';
    if (m === 'grid') igV.pause(); else igPlay();
  }
  function igPlay() {
    igV.muted = muted;
    $('#igScreen').classList.remove('paused');
    const p = igV.play();
    if (p) p.catch(err => {
      if (err && err.name === 'AbortError') return;
      if (!igV.muted) { igV.muted = true; igV.play().catch(() => $('#igScreen').classList.add('paused')); }
      else $('#igScreen').classList.add('paused');
    });
  }
  function igSyncSound() { $('#igSound').textContent = muted ? '🔇 音なし' : '🔊 音あり'; }

  let igIdx = 0;
  function openIG(it, from) {
    pauseAll();
    igIdx = list.indexOf(it);
    igLoad(it);
    if (from && from._idx >= 0 && list[from._idx] === it && from.currentTime) igV.currentTime = from.currentTime;
    igSyncSound();
    $('#ig').hidden = false;
    igSetMode(igMode);
  }
  function igLoad(it) {
    $('#igCap').textContent = `${it.title} #あん庵`;
    igV.poster = it.poster;   // 読み込み中も真っ黒にしない
    igV.src = it.preview;
    $('.st-prog i').style.width = '0'; $('.rl-prog i').style.width = '0';
    // プロフィール一覧：この動画を先頭に、ほかの動画を並べる
    const others = list.filter(x => x !== it).slice(0, 11);
    const cover = it.thumb ? it.thumb.src : it.poster;
    $('#igGrid').innerHTML = [`<div class="pf-cell me"><img src="${esc(cover)}" alt=""><span class="ico reel"></span></div>`]
      .concat(others.map(x => `<div class="pf-cell"><img src="${esc(x.poster)}" alt="" loading="lazy"><span class="ico reel"></span></div>`)).join('');
    $('#igPos').textContent = `${igIdx + 1}/${list.length}`;
  }
  // 次・前の動画へ（d=1 で次、-1 で前）
  function igGo(d) {
    const n = igIdx + d;
    if (n < 0 || n >= list.length) { toast(d > 0 ? '最後の動画です' : '最初の動画です', 1400); return; }
    igIdx = n;
    igLoad(list[n]);
    if (igMode !== 'grid') igPlay();
    $('#igMedia').animate([{ transform: `translateY(${d > 0 ? 18 : -18}%)`, opacity: .2 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
    // 閉じたときにこの動画の位置に戻れるよう、裏のフィードも合わせる
    const s = feed.children[n];
    if (s) feed.scrollTo({ top: s.offsetTop, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
  }
  // スワイプ（上下・左右どちらでも）で動画を切り替える
  let sw = null;
  const igMedia = $('#igMedia');
  igMedia.addEventListener('pointerdown', e => {
    sw = { x: e.clientX, y: e.clientY, moved: false };
    try { igMedia.setPointerCapture(e.pointerId); } catch {}
  });
  igMedia.addEventListener('pointermove', e => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) sw.moved = true;
    igV.style.transform = Math.abs(dy) >= Math.abs(dx) ? `translateY(${dy * .4}px)` : `translateX(${dx * .4}px)`;
  });
  const swEnd = e => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    igV.style.transform = '';
    const far = Math.max(Math.abs(dx), Math.abs(dy)) > 45;
    igMedia._swiped = sw.moved;
    sw = null;
    if (e.type === 'pointercancel' || !far) return;
    if (Math.abs(dy) >= Math.abs(dx)) igGo(dy < 0 ? 1 : -1);   // 上へ＝次（リールと同じ）
    else igGo(dx < 0 ? 1 : -1);                                // 左へ＝次（ストーリーズと同じ）
  };
  igMedia.addEventListener('pointerup', swEnd);
  igMedia.addEventListener('pointercancel', swEnd);
  function closeIG() {
    $('#ig').hidden = true;
    igV.pause(); igV.removeAttribute('src'); igV.load();
  }
  $('#ig').addEventListener('click', e => {
    const t = e.target.closest('[data-ig]');
    if (t) return igSetMode(t.dataset.ig);
    if (e.target.closest('#igSound')) {
      muted = !muted; store.set('anan-muted', muted);
      igV.muted = muted; if (igV.paused) igPlay();
      igSyncSound(); syncSoundButtons();
      return;
    }
    if (e.target.closest('#igSave')) { igV.pause(); return openSave(list[igIdx]); }
    if (e.target.closest('#igMedia') && igMode !== 'grid') {
      if (igMedia._swiped) { igMedia._swiped = false; return; }
      if (igV.paused) igPlay(); else { igV.pause(); $('#igScreen').classList.add('paused'); }
    }
  });
  $('#igSafeChk').addEventListener('change', e => $('#igScreen').classList.toggle('show-safe', e.target.checked));
  igV.addEventListener('timeupdate', () => {
    if (!igV.duration) return;
    const w = `${(igV.currentTime / igV.duration) * 100}%`;
    $('.st-prog i').style.width = w; $('.rl-prog i').style.width = w;
  });

  // ---- 保存 ----
  let saveCtl = null;           // ダウンロード中の中断用
  let readyFile = null;         // 共有メニューに渡すファイル

  function closeSave() {
    $('#save').hidden = true; $('#backdrop').hidden = true;
    saveCtl?.abort(); saveCtl = null; readyFile = null;
  }
  function closeSheets() {
    // インスタ表示から開いた保存画面なら、保存画面だけ閉じてインスタ表示に戻る
    if (!$('#save').hidden && !$('#ig').hidden) { closeSave(); if (igMode !== 'grid') igPlay(); return; }
    closeSave(); $('#grid').hidden = true;
    if (!$('#ig').hidden) closeIG();
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
    // 保存できるもの：動画（BGMあり／なし）＋サムネ画像
    const opts = it.variants.map(v => ({ ...v, type: 'video/mp4', kind: 'video' }));
    if (it.thumb) opts.push({ ...it.thumb, kind: 'image', type: 'image/jpeg', label: 'サムネ画像',
      note: it.thumb.designed ? '投稿の表紙（カバー）に使う画像' : '動画の1コマを切り出した画像（表紙用）' });
    $('#save')._opts = opts;
    $('#saveOptions').innerHTML = opts.map((v, i) => `
      <div class="opt ${v.kind === 'image' ? 'opt-img' : ''}" data-v="${i}">
        ${v.kind === 'image' ? `<img class="opt-thumb" src="${esc(v.src)}" alt="">` : ''}
        <div class="opt-head"><b>${esc(v.label)}</b><span>${v.kind === 'image'
          ? `${v.w}×${v.h}・${fmtMB(v.bytes)}` : `${fmtMB(v.bytes)}・${fmtDur(it.dur)}`}</span></div>
        <p>${esc(v.note)}${v.kind === 'video' && !v.audio ? '（音声なし）' : ''}</p>
        <button class="btn go"><span class="bar"></span>${ICON.save}<span class="lab">${PREFER_SHARE ? '写真に保存する' : '端末に保存する'}</span></button>
        ${PREFER_SHARE ? '<button class="sub-link dl">ファイルとして保存（「ファイル」アプリへ）</button>' : (canShareFiles ? '<button class="sub-link sh">共有メニューで送る（LINE・ドライブなど）</button>' : '')}
      </div>`).join('');
    $('#howto').innerHTML = PREFER_SHARE
      ? '押すと読み込み、ボタンが白くなります。もう一度押すと共有メニューが開くので、動画は<b>「ビデオを保存」</b>、サムネは<b>「画像を保存」</b>を選ぶと写真アプリに入ります。'
      : IS_ANDROID
        ? '保存した動画・サムネは「ダウンロード」フォルダに入り、ギャラリーやフォトアプリから投稿に使えます。'
        : '保存した動画・サムネはパソコンの「ダウンロード」フォルダに入ります。';
    $('#save').dataset.id = it.id;
    $('#backdrop').hidden = false; $('#save').hidden = false;
    $('#save')._item = it;
  }

  $('#saveOptions').addEventListener('click', async e => {
    const opt = e.target.closest('.opt');
    if (!opt) return;
    const it = $('#save')._item;
    const v = $('#save')._opts[+opt.dataset.v];
    const btn = $('.go', opt);

    // 2回目のタップ：読み込み済みなら共有メニューを開く（iPhoneはタップ直後でないと開けないため2段階）
    if (e.target.closest('.go') && btn.classList.contains('ready') && opt._file) {
      try {
        await navigator.share({ files: [opt._file], title: it.title });
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
      const blob = await fetchWithProgress(v.src, v.type, saveCtl.signal, p => {
        bar.style.width = `${p * 100}%`; lab.textContent = `読み込み中… ${Math.round(p * 100)}%`;
      });
      const file = new File([blob], v.filename, { type: v.type });
      btn.disabled = false; bar.style.width = '0';
      if (mode === 'download') {
        saveBlob(blob, v.filename);
        markSaved(btn, it);
      } else {
        opt._file = file;
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

  async function fetchWithProgress(url, type, signal, onp) {
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
    return new Blob(chunks, { type });
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
      // 公開ページでは動画を R2（mediaBase）から読む。PCでの確認時は手元のファイルを使う
      const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      const base = (!local && d.mediaBase) || '';
      if (base) for (const it of d.items) {
        it.poster = base + it.poster; it.preview = base + it.preview;
        for (const v of it.variants) v.src = base + v.src;
        if (it.thumb) it.thumb.src = base + it.thumb.src;
      }
      DATA = d;
      const f = store.get('anan-filter', 'all');
      filter = (f === 'all' || f === 'todo' || f === 'done' || DATA.series.includes(f.slice(2))) ? f : 'all';
      const g = store.get('anan-genre', '');
      genre = (DATA.genres || []).includes(g) ? g : '';
      renderAll();
    })
    .catch(() => { feed.innerHTML = '<p style="padding:120px 20px;text-align:center">動画一覧を読み込めませんでした。再読み込みしてください。</p>'; });
})();
