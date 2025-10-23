document.addEventListener('DOMContentLoaded', () => {
  const btnAddUser = document.getElementById('btnAddUser');
  const userModal = document.getElementById('userModal');
  const modalClose = document.getElementById('modalClose');
  const modalCancel = document.getElementById('modalCancel');
  const modalSave = document.getElementById('modalSave');
  const modalTitle = document.getElementById('modalTitle');
  const userForm = document.getElementById('userForm');
  const devicesSummary = document.getElementById('devicesSummary');
  const usersCount = document.getElementById('usersCount');
  const btnRefreshDevices = document.getElementById('btnRefreshDevices');
  const operationLogPanel = document.getElementById('operationLogPanel');
  const operationLogBody = document.getElementById('operationLogBody');
  const btnCloseLog = document.getElementById('btnCloseLog');

  let editingCpf = null;

  function openModal(){ userModal.hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(){ userModal.hidden = true; userForm.reset(); editingCpf = null; document.body.style.overflow = ''; }

  userModal?.addEventListener('click', (e) => {
    if (e.target === userModal) {
      closeModal();
    }
  });

  if (userModal) userModal.hidden = true;

  async function loadUsers() {
    return;
  }

  function showOperationLog(title, result){
    operationLogPanel.hidden = false;
    operationLogBody.innerHTML = '';
    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.fontWeight = '600';
    heading.style.marginBottom = '8px';
    operationLogBody.appendChild(heading);

    if (result && result.logs) {
      const ul = document.createElement('div');
      ul.style.display = 'grid';
      ul.style.gap = '6px';
      result.logs.forEach(l => {
        const row = document.createElement('div');
        row.style.padding = '8px';
        row.style.borderRadius = '6px';
        row.style.background = '#fbfdff';
        row.textContent = `[${l.type}] ${l.message}`;
        ul.appendChild(row);
      });
      operationLogBody.appendChild(ul);
    }

    if (result && result.results) {
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Relógio</th><th>IP</th><th>Status</th><th>Info</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      result.results.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="padding:8px">${r.device}</td><td>${r.ip}</td><td>${r.success? '✅' : '❌'}</td><td>${r.error||r.result||''}</td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      operationLogBody.appendChild(table);
    }
  }

  btnCloseLog?.addEventListener('click', () => { operationLogPanel.hidden = true });

  function showSnackbar(message, type = 'info', timeout = 4000) {
    try {
      const container = document.getElementById('snackbarContainer');
      if (!container) return;
      const sb = document.createElement('div');
      sb.className = 'snackbar ' + (type === 'success' ? 'success' : (type === 'error' ? 'error' : ''));
      sb.textContent = message;
      const close = document.createElement('div');
      close.className = 'close';
      close.textContent = '✕';
      close.addEventListener('click', () => { container.removeChild(sb); });
      sb.appendChild(close);
      container.appendChild(sb);
      setTimeout(() => { try { if (container.contains(sb)) container.removeChild(sb); } catch(e){} }, timeout);
    } catch (e) { console.warn('snackbar failed', e); }
  }

  async function loadDevicesStatus(){
    const globalLoader = document.getElementById('globalLoader');
    try {
      if (btnRefreshDevices) btnRefreshDevices.disabled = true;
      if (globalLoader) globalLoader.hidden = false;
      if (devicesSummary) {
        devicesSummary.innerHTML = '';
        const sk = document.createElement('div');
        sk.className = 'status-skeleton';
        sk.style.width = '100%';
        devicesSummary.appendChild(sk);
      }

      const res = await fetchWithAuth('/devices/status');
      const data = await handleJsonResponse(res);
      const online = data.devices.filter(d => d.online).length;

      devicesSummary.innerHTML = '';
      const widget = document.createElement('div');
      widget.className = 'status-widget';
      const barWrap = document.createElement('div');
      barWrap.className = 'status-bar';
      const fill = document.createElement('div');
      fill.className = 'fill';
      const pct = Math.round((online / Math.max(1, data.devices.length)) * 100);
      fill.style.width = pct + '%';
      barWrap.appendChild(fill);
      widget.appendChild(barWrap);

      const summary = document.createElement('div');
      summary.style.fontSize = '13px';
      summary.style.color = 'var(--muted)';
      summary.textContent = `${online} de ${data.devices.length} online (${pct}%)`;
      widget.appendChild(summary);

      const chips = document.createElement('div');
      chips.className = 'status-chips';
      data.devices.forEach(d => {
        const chip = document.createElement('div');
        chip.className = 'status-chip';
     
        const last = d.lastSeen || d.last_check || d.lastSeenAt || '';
        const tooltipParts = [d.ip || ''];
        if (last) tooltipParts.push(String(last));
        chip.setAttribute('data-tooltip', `${tooltipParts.filter(Boolean).join(' • ')} — ${d.online? 'online' : 'offline'}`);
        const dot = document.createElement('div');
        dot.className = 'status-dot ' + (d.online ? 'online' : 'offline');
        const label = document.createElement('div');
        label.textContent = d.name || d.ip;
        label.style.color = 'var(--muted)';
        label.style.fontSize = '13px';
        chip.appendChild(dot);
        chip.appendChild(label);
        chips.appendChild(chip);
      });
      widget.appendChild(chips);

      devicesSummary.appendChild(widget);
    } catch (err) {
      devicesSummary.textContent = 'Falha ao carregar status dos relógios';
    } finally {
      
      try {
        if (globalLoader) globalLoader.hidden = true;
        if (btnRefreshDevices) btnRefreshDevices.disabled = false;
      } catch (e) {}
    }
  }
  
  const bulkCpfInput = document.getElementById('bulkCpfInput');
  const btnBulkDelete = document.getElementById('btnBulkDelete');

  btnBulkDelete?.addEventListener('click', async () => {
    const raw = bulkCpfInput.value || '';
    const arr = raw.split(',').map(s => s.trim()).filter(s => s.length);
  if (arr.length === 0) return showSnackbar('Informe ao menos 1 CPF', 'error');
    const cpfs = arr.map(s => s.replace(/\D/g, ''));
    if (!confirm(`Remover ${cpfs.length} usuários de TODOS os relógios?`)) return;

    try {
      btnBulkDelete.disabled = true;
      btnBulkDelete.textContent = 'Processando...';
      const res = await fetchWithAuth('/users/delete', { method: 'POST', body: JSON.stringify({ users: cpfs }), headers: { 'Content-Type': 'application/json' } });
      const data = await handleJsonResponse(res);
      showOperationLog('Remoção em lote - Resultado', data);
      bulkCpfInput.value = '';
    } catch (err) {
      showSnackbar('Erro ao remover: ' + (err.message || ''), 'error');
    } finally {
      btnBulkDelete.disabled = false;
      btnBulkDelete.textContent = 'Remover Funcionários';
    }
  });

  function escapeHtml(text){
    if (!text) return '';
    return text.replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;','`':'&#96;'}[c]));
  }

  btnRefreshDevices?.addEventListener('click', loadDevicesStatus);

  btnAddUser?.addEventListener('click', () => {
    modalTitle.textContent = 'Adicionar Usuário';
    editingCpf = null;
    openModal();
  });

  modalClose?.addEventListener('click', closeModal);
  modalCancel?.addEventListener('click', closeModal);


  async function openEditUser(cpf){
    try {
      const res = await fetchWithAuth(`/users/${encodeURIComponent(cpf)}`);
      const data = await handleJsonResponse(res);
      const u = data.data;
      document.getElementById('fieldCpf').value = u.cpf;
      document.getElementById('fieldName').value = u.name;
      document.getElementById('fieldRegistration').value = u.registration||'';
      document.getElementById('fieldRfid').value = u.rfid||'';
      document.getElementById('fieldAdmin').checked = !!u.admin;
      editingCpf = u.cpf;
      modalTitle.textContent = `Editar - ${u.name}`;
      openModal();
    } catch (err) {
      showSnackbar('Erro ao carregar usuário: ' + (err.message || ''), 'error');
    }
  }

  async function confirmRemoveUser(cpf){
    if (!confirm(`Remover usuário ${cpf} de TODOS os relógios?`)) return;
    try {
      const res = await fetchWithAuth(`/users/${encodeURIComponent(cpf)}`, { method: 'DELETE' });
  const data = await handleJsonResponse(res);
  showOperationLog('Remoção de usuário - Resultado', data);
    } catch (err) {
      showSnackbar('Erro ao remover: ' + (err.message || ''), 'error');
    }
  }

  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cpf = document.getElementById('fieldCpf').value.trim();
    const name = document.getElementById('fieldName').value.trim();
    const registration = document.getElementById('fieldRegistration').value.trim();
    const rfid = document.getElementById('fieldRfid').value.trim();
    const admin = document.getElementById('fieldAdmin').checked;

    if (!/^[0-9]{11}$/.test(cpf)){
      showSnackbar('CPF deve ter 11 dígitos numéricos', 'error');
      return;
    }

    const payload = { cpf, name };
    if (registration) payload.registration = registration;
    if (rfid) payload.rfid = rfid;
    if (admin) payload.admin = true;

    const photoInput = document.getElementById('fieldPhoto');
    if (photoInput && photoInput.files && photoInput.files.length) {
      try {
        const file = photoInput.files[0];
        const dataUrl = await readFileAsDataURL(file);
        const resized = await resizeImageDataURL(dataUrl, 800, 0.8);
        const base64 = resized.replace(/^data:[^;]+;base64,/, '');
        payload.image = base64;
        payload.image_timestamp = Math.floor(Date.now() / 1000);
      } catch (imgErr) {
        showSnackbar('Falha ao processar imagem: ' + (imgErr && imgErr.message ? imgErr.message : ''), 'error');
        modalSave.disabled = false;
        modalSave.textContent = 'Salvar';
        return;
      }
    }

    try {
      modalSave.disabled = true;
      modalSave.textContent = 'Processando...';
      let res, data;
      if (editingCpf) {
        res = await fetchWithAuth(`/users/${encodeURIComponent(editingCpf)}`, { method: 'PUT', body: JSON.stringify(payload) });
        data = await handleJsonResponse(res);
        showOperationLog('Atualização de usuário - Resultado', data);
      } else {
        res = await fetchWithAuth('/users', { method: 'POST', body: JSON.stringify(payload) });
        data = await handleJsonResponse(res);
        showOperationLog('Adição de usuário - Resultado', data);
      }

  closeModal();
    } catch (err) {
      showSnackbar('Erro ao salvar: ' + (err.message || ''), 'error');
    } finally {
      modalSave.disabled = false;
      modalSave.textContent = 'Salvar';
    }
  });

  loadDevicesStatus();

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = (e) => reject(e);
      fr.readAsDataURL(file);
    });
  }

  function resizeImageDataURL(dataUrl, maxSize = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w > h) {
              h = Math.round(h * (maxSize / w));
              w = maxSize;
            } else {
              w = Math.round(w * (maxSize / h));
              h = maxSize;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const out = canvas.toDataURL('image/jpeg', quality);
          resolve(out);
        };
        img.onerror = (e) => reject(new Error('Arquivo de imagem inválido'));
        img.src = dataUrl;
      } catch (e) { reject(e); }
    });
  }

  const photoInputEl = document.getElementById('fieldPhoto');
  const photoPreview = document.getElementById('photoPreview');
  if (photoInputEl) {
    photoInputEl.addEventListener('change', async () => {
      const f = photoInputEl.files && photoInputEl.files[0];
      if (!f) { photoPreview.src = ''; photoPreview.style.display = 'none'; return; }
      try {
        const url = await readFileAsDataURL(f);
        const thumb = await resizeImageDataURL(url, 240, 0.7);
        photoPreview.src = thumb;
        photoPreview.style.display = 'block';
        // show clear button
        const clearBtn = document.getElementById('photoClear');
        if (clearBtn) clearBtn.style.display = 'inline-block';
      } catch (e) {
        photoPreview.style.display = 'none';
      }
    });
  }

  const photoClearBtn = document.getElementById('photoClear');
  if (photoClearBtn) {
    photoClearBtn.addEventListener('click', () => {
      if (photoInputEl) {
        photoInputEl.value = '';
      }
      if (photoPreview) {
        photoPreview.src = '';
        photoPreview.style.display = 'none';
      }
      photoClearBtn.style.display = 'none';
    });
  }

  function debounce(fn, wait){
    let t;
    return function(){
      clearTimeout(t);
      const args = arguments;
      t = setTimeout(()=>fn.apply(this,args), wait);
    }
  }
});
