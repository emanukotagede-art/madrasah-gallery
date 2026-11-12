// Pembantu umum untuk halaman publik.

// Gambar foto publik di Google Drive (hanya bekerja untuk file berstatus Published)
function thumbUrl(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w480';
}

function photoUrl(fileId, width) {
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + (width || 1600);
}

// 2026-11-10 -> 10 November 2026
function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return s || '';
  return new Date(+m[1], +m[2] - 1, +m[3])
    .toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
