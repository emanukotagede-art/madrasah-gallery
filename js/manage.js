// Daftar dan pengelolaan dokumentasi di halaman admin.
// Memerlukan js/api.js. Dipanggil dari js/admin.js.
const Manager = (function () {
  const FILTERS = [
    ['', 'Semua'],
    ['Review', 'Review'],
    ['Draft', 'Draft'],
    ['Published', 'Published'],
    ['Archived', 'Archived']
  ];
  const imgCache = {};   // id foto -> data URL thumbnail
  let opts = {};
  let role = '';
  let page = 1;
  let statusFilter = '';
  let query = '';
  let busy = false;
  let seqNo = 0;
  let categories = [];
  let events = [];
  let editing = null;
  let thumbEls = {};

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function button(label, cls, handler) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', handler);
    return b;
  }

  function setMsg(text, ok) {
    const e = $('mg-msg');
    e.textContent = text || '';
    e.className = 'msg' + (ok ? ' ok' : '');
  }

  function authLost() {
    if (opts.onAuthError) opts.onAuthError();
  }

  function fmtDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return s || '';
    return new Date(+m[1], +m[2] - 1, +m[3])
      .toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function clearCache() {
    Object.keys(imgCache).forEach(function (k) { delete imgCache[k]; });
  }

  // ----- Tampilan daftar -----

  function renderFilters(counts) {
    const box = $('mg-filters');
    box.textContent = '';
    const total = counts.Draft + counts.Review + counts.Published + counts.Archived;
    FILTERS.forEach(function (f) {
      const n = f[0] ? counts[f[0]] : total;
      const cls = 'mg-filter' + (statusFilter === f[0] ? ' active' : '');
      box.appendChild(button(f[1] + ' (' + n + ')', cls, function () {
        if (busy) return;
        statusFilter = f[0];
        load(1);
      }));
    });
  }

  function buildItem(it) {
    const box = el('article', 'mg-item');

    const img = el('img', 'mg-thumb');
    img.alt = '';
    if (imgCache[it.id]) img.src = imgCache[it.id];
    thumbEls[it.id] = img;

    const body = el('div', 'mg-body');
    const top = el('p', 'mg-top');
    top.appendChild(el('span', 'badge s-' + it.status, it.status));
    top.appendChild(el('span', 'mg-id', it.id));
    body.appendChild(top);
    body.appendChild(el('h3', '', it.title));
    body.appendChild(el('p', 'mg-meta',
      fmtDate(it.eventDate) + ' · ' + (it.categoryName || '(tanpa kategori)') + ' · ' + it.eventName));
    body.appendChild(el('p', 'mg-meta', 'Dikirim oleh ' + it.submittedBy + ' · ' + it.createdAt));
    const d = it.description.length > 200 ? it.description.slice(0, 200) + '…' : it.description;
    body.appendChild(el('p', 'mg-desc', d));

    const act = el('div', 'mg-actions');
    act.appendChild(button('Lihat foto', 'secondary', function () { viewFull(it); }));

    if (role === 'Admin') {
      act.appendChild(button('Edit', 'secondary', function () { openEdit(it); }));

      if (it.status !== 'Published') {
        act.appendChild(button('Publikasikan', '', function () {
          setStatus(it, 'Published', 'Publikasikan "' + it.title + '"? Foto akan tampil di website publik.');
        }));
      }
      if (it.status === 'Published') {
        act.appendChild(button('Tarik ke Draft', 'secondary', function () {
          setStatus(it, 'Draft', 'Tarik "' + it.title + '" dari website publik dan jadikan Draft?');
        }));
      }
      if (it.status === 'Review' || it.status === 'Archived') {
        act.appendChild(button('Jadikan Draft', 'secondary', function () {
          setStatus(it, 'Draft', null);
        }));
      }
      if (it.status !== 'Archived') {
        act.appendChild(button('Arsipkan', 'secondary', function () {
          setStatus(it, 'Archived', it.status === 'Published'
            ? 'Arsipkan "' + it.title + '"? Foto akan hilang dari website publik.' : null);
        }));
      }
      act.appendChild(button('Hapus', 'danger', function () { removeItem(it); }));
    }
    body.appendChild(act);

    box.appendChild(img);
    box.appendChild(body);
    return box;
  }

  function renderItems(r) {
    const list = $('mg-list');
    list.textContent = '';
    thumbEls = {};
    if (!r.items.length) {
      list.appendChild(el('p', 'mg-empty', 'Tidak ada dokumentasi pada tampilan ini.'));
    }
    r.items.forEach(function (it) { list.appendChild(buildItem(it)); });

    const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
    $('mg-page-info').textContent = r.total + ' dokumentasi · halaman ' + r.page + ' dari ' + pages;
    $('mg-prev').disabled = r.page <= 1;
    $('mg-next').disabled = !r.hasMore;
  }

  // ----- Thumbnail (foto privat, lewat backend) -----

  function applyThumb(id) {
    if (thumbEls[id] && imgCache[id]) thumbEls[id].src = imgCache[id];
  }

  async function loadThumbs(ids, my) {
    ids.forEach(applyThumb);
    const need = ids.filter(function (id) { return !(id in imgCache); });
    for (let i = 0; i < need.length; i += 12) {
      const chunk = need.slice(i, i + 12);
      const r = await apiAuth('adminImage', { ids: chunk, size: 'thumb' });
      if (my !== seqNo) return;
      if (!r.ok) {
        if (r.code === 'AUTH') return authLost();
        return;
      }
      chunk.forEach(function (id) {
        imgCache[id] = r.images[id] ? 'data:image/jpeg;base64,' + r.images[id] : '';
        applyThumb(id);
      });
    }
  }

  // ----- Memuat daftar -----

  async function load(p, okMsg) {
    const my = ++seqNo;
    page = p || 1;
    setMsg('Memuat…');
    const r = await apiAuth('adminList', { status: statusFilter, q: query, page: page });
    if (my !== seqNo) return;
    if (!r.ok) {
      if (r.code === 'AUTH') return authLost();
      return setMsg(r.error || 'Gagal memuat daftar');
    }
    if (!r.items.length && page > 1) return load(page - 1, okMsg); // halaman terakhir sudah kosong
    setMsg(okMsg || '', !!okMsg);
    renderFilters(r.counts);
    renderItems(r);
    loadThumbs(r.items.map(function (x) { return x.id; }), my);
  }

  // ----- Aksi -----

  async function setStatus(it, status, ask) {
    if (busy) return;
    if (ask && !window.confirm(ask)) return;
    busy = true;
    setMsg('Memproses…');
    const r = await apiAuth('adminSetStatus', { id: it.id, status: status });
    busy = false;
    if (!r.ok) {
      if (r.code === 'AUTH') return authLost();
      return setMsg(r.error || 'Gagal mengubah status');
    }
    load(page, it.id + ' sekarang berstatus ' + status);
  }

  async function removeItem(it) {
    if (busy) return;
    if (!window.confirm('Hapus "' + it.title + '" (' + it.id + ')?\n\nData akan dihapus dan file foto dipindah ke Sampah Google Drive.')) return;
    busy = true;
    setMsg('Menghapus…');
    const r = await apiAuth('adminDelete', { id: it.id, confirm: true });
    busy = false;
    if (!r.ok) {
      if (r.code === 'AUTH') return authLost();
      return setMsg(r.error || 'Gagal menghapus');
    }
    delete imgCache[it.id]; // ID bisa dipakai lagi, jangan tampilkan gambar lama
    load(page, it.id + ' dihapus');
  }

  async function viewFull(it) {
    const img = $('dlg-view-img');
    $('dlg-view-title').textContent = it.title;
    $('dlg-view-status').textContent = 'Memuat foto…';
    img.removeAttribute('src');
    $('dlg-view').showModal();
    const r = await apiAuth('adminImage', { ids: [it.id], size: 'full' });
    if (!r.ok) {
      if (r.code === 'AUTH') { $('dlg-view').close(); return authLost(); }
      $('dlg-view-status').textContent = r.error || 'Gagal memuat foto';
      return;
    }
    if (r.images[it.id]) {
      img.src = 'data:image/jpeg;base64,' + r.images[it.id];
      $('dlg-view-status').textContent = '';
    } else {
      $('dlg-view-status').textContent = 'Foto tidak dapat dimuat';
    }
  }

  // ----- Edit -----

  function setEdMsg(t) { $('msg-edit').textContent = t || ''; }

  function fillCategories(currentId, currentName) {
    const sel = $('ed-category');
    sel.textContent = '';
    let found = false;
    categories.forEach(function (c) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      if (c.id === currentId) found = true;
      sel.appendChild(o);
    });
    if (!found) {
      const o = document.createElement('option');
      o.value = currentId;
      o.textContent = (currentName || currentId) + ' (nonaktif, pilih kategori lain)';
      sel.insertBefore(o, sel.firstChild);
    }
    sel.value = currentId;
  }

  function openEdit(it) {
    editing = it;
    $('ed-title').value = it.title;
    $('ed-desc').value = it.description;
    $('ed-event').value = it.eventName;
    $('ed-date').value = it.eventDate;
    fillCategories(it.categoryId, it.categoryName);
    const dl = $('ed-events');
    dl.textContent = '';
    events.forEach(function (n) {
      const o = document.createElement('option');
      o.value = n;
      dl.appendChild(o);
    });
    setEdMsg('');
    $('dlg-edit').showModal();
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing || busy) return;
    busy = true;
    $('btn-edit-save').disabled = true;
    setEdMsg('Menyimpan…');
    const r = await apiAuth('adminUpdate', {
      id: editing.id,
      title: $('ed-title').value,
      description: $('ed-desc').value,
      categoryId: $('ed-category').value,
      eventName: $('ed-event').value,
      eventDate: $('ed-date').value
    });
    busy = false;
    $('btn-edit-save').disabled = false;
    if (!r.ok) {
      if (r.code === 'AUTH') { $('dlg-edit').close(); return authLost(); }
      return setEdMsg(r.error || 'Gagal menyimpan');
    }
    $('dlg-edit').close();
    load(page, 'Perubahan pada ' + editing.id + ' disimpan');
  }

  // ----- Siklus hidup -----

  async function fetchMeta() {
    const r = await apiGet({ action: 'meta' });
    if (r.ok) {
      categories = r.categories;
      events = r.events;
    }
  }

  function start(userRole) {
    role = userRole;
    statusFilter = '';
    query = '';
    $('mg-q').value = '';
    $('mg-note').textContent = (role === 'Admin') ? '' : 'Anda hanya melihat dokumentasi yang Anda kirim.';
    fetchMeta();
    load(1);
  }

  function reload() {
    clearCache();
    load(1);
  }

  function stop() {
    seqNo++;
    role = '';
    clearCache();
    $('mg-list').textContent = '';
    $('mg-filters').textContent = '';
    setMsg('');
    ['dlg-view', 'dlg-edit'].forEach(function (id) {
      const d = $(id);
      if (d.open) d.close();
    });
  }

  function init(options) {
    opts = options || {};
    $('form-search').addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      query = $('mg-q').value.trim();
      load(1);
    });
    $('mg-prev').addEventListener('click', function () { if (!busy) load(page - 1); });
    $('mg-next').addEventListener('click', function () { if (!busy) load(page + 1); });
    $('form-edit').addEventListener('submit', saveEdit);
    $('btn-edit-cancel').addEventListener('click', function () { $('dlg-edit').close(); });
    $('btn-view-close').addEventListener('click', function () { $('dlg-view').close(); });
  }

  return { init: init, start: start, stop: stop, reload: reload };
})();
