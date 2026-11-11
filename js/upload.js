// Modul upload foto: pilih, kompres di browser, kirim satu per satu.
// Memerlukan js/api.js. Dipakai di admin.html (dan nanti kirim.html).
const Uploader = (function () {
  const MAX_FILES = 20;
  const MAX_INPUT_MB = 25;
  const MAIN_MAX_SIDE = 1600;
  const THUMB_MAX_SIDE = 480;
  const MAX_MAIN_KB = 3000;  // server menerima maksimal 3072 KB
  const MAX_THUMB_KB = 280;  // server menerima maksimal 300 KB

  let items = [];       // { file, row, titleEl, capEl, removeBtn, statusEl, prevUrl, done }
  let uploading = false;
  let opts = {};

  function $(id) { return document.getElementById(id); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function todayLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function setMsg(text, ok) {
    const el = $('msg-upload');
    el.textContent = text || '';
    el.className = 'msg' + (ok ? ' ok' : '');
  }

  function setStatus(it, text, kind) {
    it.statusEl.textContent = text;
    it.statusEl.className = 'up-status' + (kind ? ' ' + kind : '');
  }

  function warnLeave(e) {
    e.preventDefault();
    e.returnValue = '';
  }

  // ----- Daftar foto -----

  function refreshLocks() {
    items.forEach(function (it) {
      const lock = uploading || it.done;
      it.titleEl.disabled = lock;
      it.capEl.disabled = lock;
      it.removeBtn.disabled = uploading;
    });
    ['btn-upload', 'up-files', 'up-category', 'up-event', 'up-date'].forEach(function (id) {
      $(id).disabled = uploading;
    });
    $('btn-upload').textContent = uploading ? 'Mengunggah…' : 'Unggah semua foto';
  }

  function addFiles(files) {
    setMsg('');
    const skipped = [];
    files.forEach(function (file) {
      if (items.length >= MAX_FILES) {
        skipped.push(file.name + ' (maksimal ' + MAX_FILES + ' foto sekali unggah)');
        return;
      }
      if (!/^image\//.test(file.type)) {
        skipped.push(file.name + ' (bukan gambar)');
        return;
      }
      if (file.size > MAX_INPUT_MB * 1024 * 1024) {
        skipped.push(file.name + ' (lebih dari ' + MAX_INPUT_MB + ' MB)');
        return;
      }
      items.push(buildRow(file));
    });
    if (skipped.length) setMsg('Dilewati: ' + skipped.join('; '));
    refreshLocks();
  }

  function buildRow(file) {
    const row = document.createElement('div');
    row.className = 'up-row';

    const prev = document.createElement('img');
    prev.className = 'up-prev';
    prev.alt = '';
    const prevUrl = URL.createObjectURL(file);
    prev.src = prevUrl;

    const fields = document.createElement('div');
    fields.className = 'up-fields';

    const lt = document.createElement('label');
    lt.textContent = 'Judul';
    const titleEl = document.createElement('input');
    titleEl.type = 'text';
    titleEl.maxLength = 150;
    lt.appendChild(titleEl);

    const lc = document.createElement('label');
    lc.textContent = 'Caption (laporan singkat kegiatan)';
    const capEl = document.createElement('textarea');
    capEl.rows = 3;
    capEl.maxLength = 2000;
    lc.appendChild(capEl);

    const statusEl = document.createElement('p');
    statusEl.className = 'up-status';
    statusEl.textContent = file.name;

    fields.appendChild(lt);
    fields.appendChild(lc);
    fields.appendChild(statusEl);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'secondary';
    removeBtn.textContent = 'Hapus';

    row.appendChild(prev);
    row.appendChild(fields);
    row.appendChild(removeBtn);
    $('up-list').appendChild(row);

    const it = {
      file: file, row: row, titleEl: titleEl, capEl: capEl,
      removeBtn: removeBtn, statusEl: statusEl, prevUrl: prevUrl, done: false
    };

    removeBtn.addEventListener('click', function () {
      if (uploading) return;
      URL.revokeObjectURL(prevUrl);
      row.remove();
      items = items.filter(function (x) { return x !== it; });
      refreshLocks();
    });
    return it;
  }

  // ----- Kompresi gambar di browser -----

  async function decode(file) {
    if (window.createImageBitmap) {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return {
          src: bmp, w: bmp.width, h: bmp.height,
          close: function () { if (bmp.close) bmp.close(); }
        };
      } catch (e) { /* lanjut ke cara cadangan */ }
    }
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, close: function () {} });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Gambar tidak dapat dibaca. Gunakan foto JPG atau PNG.'));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
  }

  async function encode(dec, maxSide, startQuality, maxKb) {
    const scale = Math.min(1, maxSide / Math.max(dec.w, dec.h));
    const w = Math.max(1, Math.round(dec.w * scale));
    const h = Math.max(1, Math.round(dec.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';          // latar putih untuk gambar transparan (PNG)
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dec.src, 0, 0, w, h);

    let q = startQuality;
    let blob = await canvasToBlob(canvas, q);
    while (blob && blob.size > maxKb * 1024 && q > 0.4) {
      q -= 0.1;
      blob = await canvasToBlob(canvas, q);
    }
    if (!blob || blob.size > maxKb * 1024) throw new Error('Foto terlalu besar setelah dikompres');
    return { blob: blob, w: w, h: h };
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = function () { reject(new Error('Gagal membaca file')); };
      r.readAsDataURL(blob);
    });
  }

  // ----- Proses satu foto -----

  // Hasil: 'ok', 'fail', atau 'auth' (sesi habis)
  async function processItem(it, shared) {
    const title = it.titleEl.value.trim();
    const caption = it.capEl.value.trim();
    if (title.length < 3) { setStatus(it, 'Judul minimal 3 karakter', 'err'); return 'fail'; }
    if (caption.length < 10) { setStatus(it, 'Caption minimal 10 karakter', 'err'); return 'fail'; }

    let dec = null;
    try {
      setStatus(it, 'Mengompres…');
      dec = await decode(it.file);
      const main = await encode(dec, MAIN_MAX_SIDE, 0.82, MAX_MAIN_KB);
      const thumb = await encode(dec, THUMB_MAX_SIDE, 0.75, MAX_THUMB_KB);
      dec.close();
      dec = null;

      setStatus(it, 'Mengunggah…');
      const r = await apiAuth('upload', {
        title: title,
        description: caption,
        categoryId: shared.categoryId,
        eventName: shared.eventName,
        eventDate: shared.eventDate,
        width: main.w,
        height: main.h,
        photoBase64: await blobToBase64(main.blob),
        thumbBase64: await blobToBase64(thumb.blob)
      });

      if (r.ok) {
        it.done = true;
        setStatus(it, 'Berhasil: ' + r.id + ' (status ' + r.status + ')', 'ok');
        it.row.classList.add('done');
        return 'ok';
      }
      if (r.code === 'AUTH') return 'auth';
      setStatus(it, r.error || 'Gagal mengunggah', 'err');
      return 'fail';
    } catch (err) {
      if (dec) dec.close();
      setStatus(it, err.message || 'Gagal memproses foto', 'err');
      return 'fail';
    }
  }

  async function startUpload() {
    if (uploading) return;
    setMsg('');

    const shared = {
      categoryId: $('up-category').value,
      eventName: $('up-event').value.trim(),
      eventDate: $('up-date').value
    };
    if (!shared.categoryId) return setMsg('Pilih kategori dulu');
    if (shared.eventName.length < 3) return setMsg('Nama kegiatan minimal 3 karakter');
    if (!shared.eventDate) return setMsg('Isi tanggal kegiatan');

    const pending = items.filter(function (it) { return !it.done; });
    if (!pending.length) return setMsg('Belum ada foto yang dipilih');

    uploading = true;
    refreshLocks();
    window.addEventListener('beforeunload', warnLeave);

    let okCount = 0;
    let failCount = 0;
    let authLost = false;
    for (let i = 0; i < pending.length; i++) {
      const res = await processItem(pending[i], shared);
      if (res === 'ok') okCount++;
      else if (res === 'auth') { authLost = true; break; }
      else failCount++;
    }

    uploading = false;
    window.removeEventListener('beforeunload', warnLeave);
    refreshLocks();

    if (authLost) {
      if (opts.onAuthError) opts.onAuthError();
      return;
    }
    let text = 'Selesai: ' + okCount + ' berhasil, ' + failCount + ' gagal.';
    if (okCount) text += ' Foto yang berhasil belum tampil di publik sampai dipublikasikan.';
    if (failCount) text += ' Perbaiki foto yang gagal lalu klik Unggah lagi (foto yang sudah berhasil tidak dikirim ulang).';
    setMsg(text, failCount === 0);
  }

  // ----- Awal -----

  async function loadMeta() {
    const r = await apiGet({ action: 'meta' });
    if (!r.ok) {
      setMsg(r.error || 'Gagal memuat daftar kategori. Muat ulang halaman.');
      return;
    }
    const sel = $('up-category');
    r.categories.forEach(function (c) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
    const dl = $('up-events');
    r.events.forEach(function (name) {
      const o = document.createElement('option');
      o.value = name;
      dl.appendChild(o);
    });
  }

  function init(options) {
    opts = options || {};
    const today = todayLocal();
    $('up-date').value = today;
    $('up-date').max = today;

    $('up-files').addEventListener('change', function (e) {
      const list = Array.from(e.target.files);
      e.target.value = '';
      addFiles(list);
    });
    $('btn-upload').addEventListener('click', startUpload);
    loadMeta();
  }

  return { init: init };
})();
