// Pembantu komunikasi dengan API (Google Apps Script).
// Memerlukan js/config.js (berisi API_URL) dimuat lebih dulu.

const TOKEN_KEY = 'mg_token';

const ERR_NETWORK = { ok: false, error: 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.' };

// Baca data (GET)
async function apiGet(params) {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(API_URL + '?' + qs);
    return await res.json();
  } catch (err) {
    return ERR_NETWORK;
  }
}

// Kirim data (POST). Sengaja TANPA header Content-Type agar browser
// tidak melakukan "preflight" yang tidak didukung Apps Script.
async function apiPost(action, data) {
  try {
    const body = Object.assign({ action: action }, data || {});
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
    return await res.json();
  } catch (err) {
    return ERR_NETWORK;
  }
}

function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
}

function setToken(t) {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
}

// POST yang otomatis menyertakan token login
function apiAuth(action, data) {
  return apiPost(action, Object.assign({ token: getToken() }, data || {}));
}
