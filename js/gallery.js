// Logika galeri publik. Memerlukan js/api.js dan js/common.js.
(function () {
  const $ = function (id) { return document.getElementById(id); };

  let items = [];          // semua foto yang sudah dimuat
  let page = 1;
  let hasMore = false;
  let loading = false;
  let seq = 0;             // penanda permintaan terbaru (mencegah hasil lama menimpa hasil baru)
  let current = -1;        // indeks foto yang sedang dibuka di lightbox
  let detailSeq = 0;
  const state = { q: '', category: '', year: '', event: '' };

  function setStatus(text) { $('g-status').textContent = text || ''; }

  // ----- Filter <-> alamat halaman -----

  function readUrl() {
    const p = new URLSearchParams(location.search);
    Object.keys(state).forEach(function (k) {
      state[k] = String(p.get(k) || '').slice(0, 120);
    });
  }

  function writeUrl() {
    const p = new URLSearchParams();
    Object.keys(state).forEach(function (k) { if (state[k]) p.set(k, state[k]); });
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function syncForm() {
    $('g-q').value = state.q;
    $('g-category').value = state.category;
    $('g-year').value = state.year;
    $('g-event').value = state.event;
    // jika nilai dari alamat tidak ada di pilihan, kembalikan ke "semua"
    ['category', 'year', 'event'].forEach(function (k) {
      if ($('g-' + k).value !== state[k]) state[k] = '';
    });
  }

  function addOption(sel, value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    sel.appendChild(o);
  }

  async function loadMeta() {
    const r = await apiGet({ action: 'meta' });
    if (!r.ok) {
      setStatus(r.error || 'Gagal memuat pilihan filter');
      return;
    }
    r.categories.forEach(function (c) { addOption($('g-category'), c.id, c.name); });
    r.years.forEach(function (y) { addOption($('g-year'), y, y); });
    r.events.forEach(function (n) { addOption($('g-event'), n, n); });
  }

  // ----- Kartu foto -----

  function buildCard(it, index) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'g-card';

    const img = document.createElement('img');
    img.alt = it.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    if (it.width && it.height) img.style.aspectRatio = it.width + ' / ' + it.height;
    img.src = thumbUrl(it.thumbId);

    const h = document.createElement('h3');
    h.textContent = it.title;
    const meta = document.createElement('p');
    meta.textContent = fmtDate(it.eventDate) + (it.categoryName ? ' · ' + it.categoryName : '');

    card.appendChild(img);
    card.appendChild(h);
    card.appendChild(meta);
    card.addEventListener('click', function () { openBox(index); });
    return card;
  }

  function updateMore() {
    const b = $('g-more');
    b.hidden = !hasMore;
    b.disabled = loading;
    b.textContent = loading ? 'Memuat…' : 'Muat lebih banyak';
  }

  async function load(reset) {
    const my = ++seq;
    if (reset) {
      page = 1;
      items = [];
      hasMore = false;
      $('g-grid').textContent = '';
    }
    loading = true;
    setStatus('Memuat…');
    updateMore();

    const r = await apiGet({
      action: 'photos',
      q: state.q,
      category: state.category,
      year: state.year,
      event: state.event,
      page: page
    });
    if (my !== seq) return; // sudah ada permintaan yang lebih baru

    loading = false;
    if (!r.ok) {
      setStatus(r.error || 'Gagal memuat dokumentasi');
      updateMore();
      return;
    }
    r.items.forEach(function (it) {
      items.push(it);
      $('g-grid').appendChild(buildCard(it, items.length - 1));
    });
    hasMore = r.hasMore;
    page = r.page + 1;
    setStatus(r.total ? r.total + ' dokumentasi' : 'Belum ada dokumentasi yang cocok.');
    updateMore();
  }

  // ----- Lightbox -----

  function renderBox(it) {
    const img = $('g-box-img');
    img.referrerPolicy = 'no-referrer';
    img.alt = it.title;
    img.src = photoUrl(it.fileId, 1600);
    $('g-box-title').textContent = it.title;
    $('g-box-meta').textContent = fmtDate(it.eventDate) +
      (it.categoryName ? ' · ' + it.categoryName : '') + ' · ' + it.eventName;
    $('g-box-desc').textContent = it.description; // sementara versi singkat
    $('g-box-prev').disabled = current <= 0;
    $('g-box-next').disabled = current >= items.length - 1;
  }

  async function openBox(index) {
    if (index < 0 || index >= items.length) return;
    current = index;
    const it = items[index];
    renderBox(it);
    if (!$('g-box').open) $('g-box').showModal();

    // Daftar hanya membawa caption singkat; ambil caption lengkapnya
    const my = ++detailSeq;
    const r = await apiGet({ action: 'photo', id: it.id });
    if (my !== detailSeq || !r.ok) return;
    $('g-box-desc').textContent = r.item.description;
  }

  function closeBox() {
    detailSeq++;
    $('g-box').close();
    $('g-box-img').removeAttribute('src');
  }

  // ----- Awal -----

  function applyFilters() {
    state.q = $('g-q').value.trim();
    state.category = $('g-category').value;
    state.year = $('g-year').value;
    state.event = $('g-event').value;
    writeUrl();
    load(true);
  }

  async function start() {
    readUrl();
    $('g-q').value = state.q;
    await loadMeta();
    syncForm();
    writeUrl();
    load(true);
  }

  $('g-form').addEventListener('submit', function (e) {
    e.preventDefault();
    applyFilters();
  });
  ['g-category', 'g-year', 'g-event'].forEach(function (id) {
    $(id).addEventListener('change', applyFilters);
  });
  $('g-reset').addEventListener('click', function () {
    $('g-q').value = '';
    $('g-category').value = '';
    $('g-year').value = '';
    $('g-event').value = '';
    applyFilters();
  });
  $('g-more').addEventListener('click', function () {
    if (!loading && hasMore) load(false);
  });
  $('g-box-detail').addEventListener('click', function () {
    if (current >= 0 && items[current]) {
      location.href = 'foto.html?id=' + encodeURIComponent(items[current].id);
  }
  });
  $('g-box-close').addEventListener('click', closeBox);
  $('g-box-prev').addEventListener('click', function () { openBox(current - 1); });
  $('g-box-next').addEventListener('click', function () { openBox(current + 1); });
  document.addEventListener('keydown', function (e) {
    if (!$('g-box').open) return;
    if (e.key === 'ArrowLeft') openBox(current - 1);
    if (e.key === 'ArrowRight') openBox(current + 1);
  });

  start();
})();
