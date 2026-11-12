// Kelola kategori dan pengguna (khusus Admin). Memerlukan js/api.js.
const People = (function () {
  const LABEL = { Active: 'Aktif', Inactive: 'Nonaktif' };
  let opts = {};
  let myUsername = '';
  let editingCat = null;   // null = menambah kategori baru
  let editingUser = null;  // null = menambah pengguna baru
  let busy = false;

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

  function msg(id, text, ok) {
    const e = $(id);
    e.textContent = text || '';
    e.className = 'msg' + (ok ? ' ok' : '');
  }

  function authLost() {
    if (opts.onAuthError) opts.onAuthError();
  }

  function badge(status) {
    return el('span', 'badge s-' + status, LABEL[status] || status);
  }

  // ================= KATEGORI =================

  function renderCategories(items) {
    const box = $('pp-cat-list');
    box.textContent = '';
    if (!items.length) box.appendChild(el('p', 'mg-empty', 'Belum ada kategori.'));
    items.forEach(function (c) {
      const row = el('div', 'pp-row');
      const info = el('div', 'pp-info');
      const top = el('p', 'pp-name');
      top.appendChild(el('strong', '', c.name));
      top.appendChild(document.createTextNode(' '));
      top.appendChild(badge(c.status));
      info.appendChild(top);
      info.appendChild(el('p', 'mg-meta',
        (c.description || '(tanpa deskripsi)') + ' · ' + c.photoCount + ' dokumentasi · ' + c.id));
      row.appendChild(info);
      const act = el('div', 'pp-actions');
      act.appendChild(button('Edit', 'secondary', function () { openCat(c); }));
      row.appendChild(act);
      box.appendChild(row);
    });
  }

  async function loadCategories() {
    const r = await apiAuth('categoryList', {});
    if (!r.ok) {
      if (r.code === 'AUTH') return authLost();
      return msg('pp-cat-msg', r.error || 'Gagal memuat kategori');
    }
    renderCategories(r.items);
  }

  function openCat(c) {
    editingCat = c || null;
    $('cat-dlg-title').textContent = c ? 'Edit kategori' : 'Tambah kategori';
    $('cat-name').value = c ? c.name : '';
    $('cat-desc').value = c ? c.description : '';
    $('cat-status').value = c ? c.status : 'Active';
    msg('msg-cat', '');
    $('dlg-cat').showModal();
  }

  async function saveCat(e) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $('btn-cat-save').disabled = true;
    msg('msg-cat', 'Menyimpan…');
    const r = await apiAuth('categorySave', {
      id: editingCat ? editingCat.id : '',
      name: $('cat-name').value,
      description: $('cat-desc').value,
      status: $('cat-status').value
    });
    busy = false;
    $('btn-cat-save').disabled = false;
    if (!r.ok) {
      if (r.code === 'AUTH') { $('dlg-cat').close(); return authLost(); }
      return msg('msg-cat', r.error || 'Gagal menyimpan');
    }
    $('dlg-cat').close();
    msg('pp-cat-msg', 'Kategori disimpan. Muat ulang halaman ini agar pilihan kategori di form unggah ikut diperbarui.', true);
    loadCategories();
  }

  // ================= PENGGUNA =================

  function renderUsers(items) {
    const box = $('pp-user-list');
    box.textContent = '';
    items.forEach(function (u) {
      const isMe = (u.username === myUsername);
      const row = el('div', 'pp-row');
      const info = el('div', 'pp-info');
      const top = el('p', 'pp-name');
      top.appendChild(el('strong', '', u.name));
      top.appendChild(document.createTextNode(' '));
      top.appendChild(badge(u.status));
      if (isMe) top.appendChild(el('span', 'mg-id', '(Anda)'));
      info.appendChild(top);
      info.appendChild(el('p', 'mg-meta',
        u.username + ' · ' + u.role + (u.mustChange ? ' · belum mengganti password sementara' : '')));
      row.appendChild(info);

      const act = el('div', 'pp-actions');
      act.appendChild(button('Edit', 'secondary', function () { openUser(u, isMe); }));
      if (!isMe) {
        act.appendChild(button('Reset password', 'secondary', function () { resetPw(u); }));
      }
      row.appendChild(act);
      box.appendChild(row);
    });
  }

  async function loadUsers() {
    const r = await apiAuth('userList', {});
    if (!r.ok) {
      if (r.code === 'AUTH') return authLost();
      return msg('pp-user-msg', r.error || 'Gagal memuat pengguna');
    }
    renderUsers(r.items);
  }

  function openUser(u, isMe) {
    editingUser = u || null;
    $('user-dlg-title').textContent = u ? 'Edit pengguna' : 'Tambah pengguna';
    $('usr-username').value = u ? u.username : '';
    $('usr-username').disabled = !!u;
    $('usr-username-hint').hidden = !!u;
    $('usr-name').value = u ? u.name : '';
    $('usr-role').value = u ? u.role : 'Petugas';
    $('usr-status').value = u ? u.status : 'Active';
    $('usr-status-box').hidden = !u;
    // akun sendiri: peran dan status dikunci (server juga menolak)
    $('usr-role').disabled = !!isMe;
    $('usr-status').disabled = !!isMe;
    msg('msg-user', isMe ? 'Peran dan status akun Anda sendiri tidak dapat diubah.' : '');
    $('dlg-user').showModal();
  }

  async function saveUser(e) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $('btn-user-save').disabled = true;
    msg('msg-user', 'Menyimpan…');

    let r;
    if (editingUser) {
      r = await apiAuth('userUpdate', {
        userId: editingUser.userId,
        name: $('usr-name').value,
        role: $('usr-role').value,
        status: $('usr-status').value
      });
    } else {
      r = await apiAuth('userCreate', {
        username: $('usr-username').value,
        name: $('usr-name').value,
        role: $('usr-role').value
      });
    }
    busy = false;
    $('btn-user-save').disabled = false;

    if (!r.ok) {
      if (r.code === 'AUTH') { $('dlg-user').close(); return authLost(); }
      return msg('msg-user', r.error || 'Gagal menyimpan');
    }
    $('dlg-user').close();
    loadUsers();
    if (r.tempPassword) {
      showSecret('Pengguna baru dibuat', r.username, r.tempPassword);
    } else {
      msg('pp-user-msg', 'Perubahan disimpan.', true);
    }
  }

  async function resetPw(u) {
    if (busy) return;
    if (!window.confirm('Reset password untuk "' + u.name + '" (' + u.username + ')?\n\nPassword lamanya tidak berlaku lagi dan sesi login-nya diakhiri.')) return;
    busy = true;
    msg('pp-user-msg', 'Memproses…');
    const r = await apiAuth('userResetPassword', { userId: u.userId });
    busy = false;
    if (!r.ok) {
      if (r.code === 'AUTH') return authLost();
      return msg('pp-user-msg', r.error || 'Gagal mereset password');
    }
    msg('pp-user-msg', '');
    loadUsers();
    showSecret('Password sudah direset', r.username, r.tempPassword);
  }

  // ----- Jendela password sementara (tampil sekali) -----

  function showSecret(title, username, password) {
    $('secret-title').textContent = title;
    $('secret-username').textContent = username;
    $('secret-pw').value = password;
    $('secret-copy-msg').textContent = '';
    $('dlg-secret').showModal();
  }

  async function copySecret() {
    const input = $('secret-pw');
    try {
      await navigator.clipboard.writeText(input.value);
      $('secret-copy-msg').textContent = 'Tersalin.';
    } catch (e) {
      input.select();
      $('secret-copy-msg').textContent = 'Blok teks lalu salin dengan Ctrl+C.';
    }
  }

  // ================= SIKLUS HIDUP =================

  function start(role, username) {
    myUsername = username || '';
    const isAdmin = (role === 'Admin');
    $('view-admin-tools').hidden = !isAdmin;
    if (!isAdmin) return;
    msg('pp-cat-msg', '');
    msg('pp-user-msg', '');
    loadCategories();
    loadUsers();
  }

  function stop() {
    $('view-admin-tools').hidden = true;
    $('pp-cat-list').textContent = '';
    $('pp-user-list').textContent = '';
    $('secret-pw').value = '';
    ['dlg-cat', 'dlg-user', 'dlg-secret'].forEach(function (id) {
      const d = $(id);
      if (d.open) d.close();
    });
  }

  function init(options) {
    opts = options || {};
    $('pp-cat-add').addEventListener('click', function () { openCat(null); });
    $('pp-user-add').addEventListener('click', function () { openUser(null, false); });
    $('form-cat').addEventListener('submit', saveCat);
    $('form-user').addEventListener('submit', saveUser);
    $('btn-cat-cancel').addEventListener('click', function () { $('dlg-cat').close(); });
    $('btn-user-cancel').addEventListener('click', function () { $('dlg-user').close(); });
    $('btn-secret-copy').addEventListener('click', copySecret);
    $('btn-secret-close').addEventListener('click', function () { $('dlg-secret').close(); });
    // password dihapus dari layar begitu jendela ditutup (termasuk dengan tombol Esc)
    $('dlg-secret').addEventListener('close', function () { $('secret-pw').value = ''; });
  }

  return { init: init, start: start, stop: stop };
})();
