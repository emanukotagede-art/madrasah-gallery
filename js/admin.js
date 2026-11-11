// Logika halaman admin: login, ganti password, logout, dan penghubung modul lain.
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const VIEWS = ['view-loading', 'view-login', 'view-change', 'view-dashboard'];
  let me = null; // { name, role, username, mustChange }
  let dashLoaded = false;

  function show(view) {
    VIEWS.forEach(function (v) { $(v).hidden = (v !== view); });
  }

  function setMsg(id, text) {
    $(id).textContent = text || '';
  }

  function setMe(r) {
    me = {
      name: r.user.name,
      role: r.user.role,
      username: r.user.username,
      mustChange: !!r.mustChange
    };
  }

  // Bersihkan data di layar saat keluar atau sesi habis
  function leaveDashboard() {
    if (dashLoaded) {
      Manager.stop();
      dashLoaded = false;
    }
  }

  // Tentukan layar yang tampil sesuai keadaan login
  function route() {
    if (!me) {
      leaveDashboard();
      show('view-login');
    } else if (me.mustChange) {
      leaveDashboard();
      $('change-info').textContent = 'Demi keamanan, Anda wajib mengganti password sementara sebelum melanjutkan.';
      $('btn-change-cancel').hidden = true;
      show('view-change');
    } else {
      $('who-name').textContent = me.name;
      $('who-role').textContent = me.role;
      show('view-dashboard');
      if (!dashLoaded) {
        dashLoaded = true;
        Manager.start(me.role);
      }
    }
  }

  // Jika server menjawab sesi tidak valid, kembali ke layar login
  function handleAuthError(r) {
    if (r && r.code === 'AUTH') {
      setToken('');
      me = null;
      setMsg('msg-login', 'Sesi berakhir. Silakan masuk lagi.');
      route();
      return true;
    }
    return false;
  }

  async function boot() {
    show('view-loading');
    if (!getToken()) {
      me = null;
      return route();
    }
    const r = await apiPost('me', { token: getToken() });
    if (r.ok) {
      setMe(r);
    } else {
      me = null;
      if (r.code === 'AUTH') setToken('');
      else setMsg('msg-login', r.error);
    }
    route();
  }

  // ----- Login -----
  $('form-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    setMsg('msg-login', '');
    const btn = $('btn-login');
    btn.disabled = true;
    btn.textContent = 'Memeriksa…';

    const r = await apiPost('login', {
      username: $('login-username').value.trim(),
      password: $('login-password').value
    });

    btn.disabled = false;
    btn.textContent = 'Masuk';

    if (!r.ok) {
      setMsg('msg-login', r.error || 'Gagal masuk');
      return;
    }
    $('login-password').value = '';
    setToken(r.token);
    setMe(r);
    route();
  });

  // ----- Ganti password -----
  $('form-change').addEventListener('submit', async function (e) {
    e.preventDefault();
    setMsg('msg-change', '');
    const oldPw = $('change-old').value;
    const newPw = $('change-new').value;
    const newPw2 = $('change-new2').value;

    if (newPw !== newPw2) {
      setMsg('msg-change', 'Password baru dan pengulangannya tidak sama');
      return;
    }

    const btn = $('btn-change');
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';

    const r = await apiAuth('changePassword', { oldPassword: oldPw, newPassword: newPw });

    btn.disabled = false;
    btn.textContent = 'Simpan password baru';

    if (!r.ok) {
      if (!handleAuthError(r)) setMsg('msg-change', r.error || 'Gagal mengganti password');
      return;
    }
    $('form-change').reset();
    setToken(r.token); // sesi baru; sesi lama otomatis mati
    setMe(r);
    route();
  });

  $('btn-open-change').addEventListener('click', function () {
    $('change-info').textContent = '';
    $('btn-change-cancel').hidden = false;
    setMsg('msg-change', '');
    show('view-change');
  });

  $('btn-change-cancel').addEventListener('click', function () {
    $('form-change').reset();
    route();
  });

  // ----- Logout -----
  $('btn-logout').addEventListener('click', async function () {
    const t = getToken();
    setToken('');
    me = null;
    setMsg('msg-login', '');
    route();
    if (t) await apiPost('logout', { token: t });
  });

  Manager.init({
    onAuthError: function () { handleAuthError({ code: 'AUTH' }); }
  });

  Uploader.init({
    onAuthError: function () { handleAuthError({ code: 'AUTH' }); },
    onUploaded: function () { Manager.reload(); }
  });

  boot();
})();
