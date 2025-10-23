const API_BASE = '/api'; 

function fetchWithAuth(path, opts = {}){
  const token = localStorage.getItem('token');
  const headers = opts.headers || {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  return fetch(`${API_BASE}${path}`, Object.assign({}, opts, { headers }));
}

function handleJsonResponse(res){
  if (res.status === 204) return null;
  return res.json().then(data => {
    if (!res.ok) {
      const err = new Error(data && data.message ? data.message : 'Erro na requisição');
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const addHeader = document.getElementById('btnAddUserHeader');
  const addMain = document.getElementById('btnAddUser');
  if (addHeader && addMain) {
    addHeader.addEventListener('click', (e) => { e.preventDefault(); addMain.click(); });
  }

  const refreshHeader = document.getElementById('btnRefreshDevices');
  const refreshMain = document.getElementById('btnRefreshDevices');
});
