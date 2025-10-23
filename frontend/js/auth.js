document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnLogin');
      btn.disabled = true;
      btn.textContent = 'Entrando...';
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Erro no login');
        localStorage.setItem('token', data.token);
        window.location.href = '/dashboard';
      } catch (err) {
        alert(err.message || 'Erro ao autenticar');
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    });
  }

  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      const token = localStorage.getItem('token');
      try {
        await fetch('/api/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      } catch (e) {
      }
      localStorage.removeItem('token');
      window.location.href = '/login';
    });
  }

  if (!location.pathname.startsWith('/login')){
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login';
    }
  }
});
