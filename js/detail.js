// Halaman detail satu dokumentasi. Memerlukan js/api.js dan js/common.js.
(function () {
  const $ = function (id) { return document.getElementById(id); };
  let shareTitle = '';
  let shareUrl = '';

  function fail(text) {
    $('d-status').textContent = text;
    $('d-article').hidden = true;
  }

  async function share() {
    const msg = $('d-share-msg');
    msg.textContent = '';
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareTitle, url: shareUrl });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // pengguna menutup menu bagikan
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      msg.textContent = 'Tautan disalin.';
    } catch (e) {
      msg.textContent = 'Salin tautan dari kolom alamat browser.';
    }
  }

  async function start() {
    const id = String(new URLSearchParams(location.search).get('id') || '').trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
      return fail('Alamat tidak valid.');
    }

    const r = await apiGet({ action: 'photo', id: id });
    if (!r.ok) {
      return fail(r.error === 'Dokumentasi tidak ditemukan'
        ? 'Dokumentasi tidak ditemukan atau belum dipublikasikan.'
        : (r.error || 'Gagal memuat dokumentasi'));
    }

    const it = r.item;
    const img = $('d-img');
    img.referrerPolicy = 'no-referrer';
    img.alt = it.title;
    if (it.width && it.height) {
      img.width = it.width;
      img.height = it.height;
    }
    img.src = photoUrl(it.fileId, 1600);

    $('d-cat').textContent = it.categoryName;
    $('d-title').textContent = it.title;
    $('d-meta').textContent = fmtDate(it.eventDate) + ' · ' + it.eventName;
    $('d-desc').textContent = it.description;
    $('d-event-link').href = 'index.html?event=' + encodeURIComponent(it.eventName);

    document.title = it.title + ' | Dokumentasi MA Nurul Ummah';
    shareTitle = it.title;
    shareUrl = location.origin + location.pathname + '?id=' + encodeURIComponent(it.id);

    $('d-status').textContent = '';
    $('d-article').hidden = false;
  }

  $('d-share').addEventListener('click', share);
  start();
})();
