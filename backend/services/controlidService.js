

const logger = require('../utils/logger');
const { spawnSync } = require('child_process');


const sessionCache = new Map();

const loginLocks = new Map();

const deviceLocks = new Map();

const SESSION_TTL_MS = 60 * 1000; // 60s


function runCurlSync(url, opts = {}) {
  // montar args
  const args = ['-sS', '--insecure', '--location', '--write-out', '\n--CURL_HTTP_CODE--%{http_code}'];
  const method = (opts.method || 'GET').toUpperCase();
  args.push('-X', method);

  const headers = opts.headers || {};
  // enviar headers
  for (const k of Object.keys(headers)) {
    // não incluir headers cujo valor seja undefined
    if (headers[k] === undefined) continue;
    args.push('-H', `${k}: ${headers[k]}`);
  }

  let body = null;
  if (opts.body) {
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    const contentLength = Buffer.byteLength(body, 'utf8');
    if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-length')) {
      args.push('-H', `Content-Length: ${contentLength}`);
    }
    args.push('-d', body);
  }

  // Execução 
  let proc;
  try {
    const timeoutMs = process.env.CONTROLID_CURL_TIMEOUT_MS ? parseInt(process.env.CONTROLID_CURL_TIMEOUT_MS, 10) : 30000;
    proc = spawnSync('curl', args.concat([url]), { encoding: 'utf8', timeout: timeoutMs });
  } catch (err) {
    throw new Error(`curl não disponível ou falha ao executar curl: ${err.message}`);
  }
  if (proc.error) {
    const errMsg = proc.error && proc.error.message ? String(proc.error.message) : 'unknown';
    const stderr = (proc.stderr || '') + '\n' + errMsg;
    return {
      ok: false,
      status: 0,
      text: async () => '',
      json: async () => { throw new Error('Resposta curl não é JSON'); },
      stderr
    };
  }


  const stdout = proc.stdout || '';
  const stderr = proc.stderr || '';

  const marker = '\n--CURL_HTTP_CODE--';
  const idx = stdout.lastIndexOf(marker);
  let httpCode = 0;
  let bodyText = stdout;
  if (idx !== -1) {
    bodyText = stdout.slice(0, idx);
    const codeStr = stdout.slice(idx + marker.length).trim();
    httpCode = parseInt(codeStr, 10) || 0;
  }

  const resObj = {
    ok: httpCode >= 200 && httpCode < 300,
    status: httpCode,
    text: async () => bodyText,
    json: async () => {
      try { return JSON.parse(bodyText); } catch (e) { throw new Error('Resposta curl não é JSON'); }
    },
    stderr
  };


  try {
    const verbose = !!process.env.CONTROLID_VERBOSE;
    if (verbose && (!resObj.ok || resObj.status === 0)) {
      const safeArgs = args.map(a => {
        try {
          // mask passwords in any -d JSON
          if (typeof a === 'string' && a.includes('password')) {
            return a.replace(/("password"\s*:\s*")[^\"]+("?)/gi, '$1****$2');
          }
          return a;
        } catch (e) { return a; }
      });
      logger.warning(`curl failed for ${url} -> status ${resObj.status}`, { args: safeArgs, stderr: stderr.slice(0, 200) });
    }
  } catch (e) {
  }

  return resObj;
}

function isSessionValidCached(ip) {
  const entry = sessionCache.get(ip);
  if (!entry) return false;
  return Date.now() < entry.expiresAt;
}

async function getSessionCached(ip, username, password) {
  
  if (isSessionValidCached(ip)) return sessionCache.get(ip).session;

  
  if (loginLocks.has(ip)) {
    return loginLocks.get(ip);
  }

  
  const p = (async () => {
    try {
      const session = await controlIdLoginHttp(ip, username, password);
      sessionCache.set(ip, { session, expiresAt: Date.now() + SESSION_TTL_MS });
      return session;
    } finally {
      loginLocks.delete(ip);
    }
  })();

  loginLocks.set(ip, p);
  return p;
}

function invalidateSession(ip) {
  sessionCache.delete(ip);
}


function withDeviceLock(ip, fn) {
  const last = deviceLocks.get(ip) || Promise.resolve();
  const next = last.then(() => fn());
  // ensure errors don't break the chain
  deviceLocks.set(ip, next.catch(() => {}));
  return next;
}

async function controlIdRequestHttp(urlPath, ip, opts = {}) {
  // Forcing HTTPS with --insecure as primary and only attempt per your request
  const httpsUrl = `https://${ip}/${urlPath}`;
  logger.info(`Tentando requisição (curl HTTPS -k) ${httpsUrl}`);
  const res = runCurlSync(httpsUrl, opts);
  return res;
}


async function controlIdLoginHttp(ip, username, password) {
  const urlPath = 'login.fcgi';
  const body = JSON.stringify({ login: String(username), password: String(password) });

  logger.info(`Tentando login (curl HTTPS primeiro) no relógio ${ip}`);
  const res = await controlIdRequestHttp(urlPath, ip, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!res.ok) {
    const text = String(await res.text());
    logger.error(`Login failed for ${ip}: HTTP ${res.status}: ${text}`);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (!data.session) throw new Error('Sessão não retornada');
  return data.session;
}


async function fetchWithFallback(url, opts = {}) {
  try {
    const agent = url.startsWith('https:') ? httpsAgent : undefined;
    return await fetch(url, Object.assign({}, opts, { agent }));
  } catch (err) {
    const msg = String(err && err.message || '').toLowerCase();
    
    const shouldTryCurl = msg.includes('parse error') || msg.includes('invalid header') || msg.includes('certificate') || msg.includes('tls') || msg.includes('ssl');


    if (url.startsWith('https:')) {
      const httpUrl = url.replace(/^https:/, 'http:');
      logger.warning(`HTTPS falhou, tentando fallback HTTP: ${httpUrl}`, { reason: err.message });
      try {
        return await fetch(httpUrl, opts);
      } catch (err2) {
        logger.warning('Fallback HTTP também falhou', { reason: err2.message });
        if (shouldTryCurl) {
          try {
            logger.warning(`Tentando fallback via curl (insecure) para ${url}`);
            return runCurlSync(url, opts);
          } catch (curlErr) {
            logger.error('Fallback curl falhou', { reason: curlErr.message });
            try {
              const httpCurlUrl = httpUrl;
              logger.warning(`Tentando fallback via curl (insecure) para ${httpCurlUrl}`);
              return runCurlSync(httpCurlUrl, opts);
            } catch (curlErr2) {
              logger.error('Fallback curl (HTTP) também falhou', { reason: curlErr2.message });
              throw err; 
            }
          }
        }
        throw err; 
      }
    }

    
    throw err;
  }
}

class ControlIdService {

  async login(ip, username, password) {
    try {
      const session = await getSessionCached(ip, username, password);
      logger.success(`Login (cache) realizado no relógio ${ip}`);
      return session;
    } catch (error) {
      logger.error(`Erro ao fazer login no relógio ${ip}`, error.message);
      throw new Error(`Falha no login (${ip}): ${error.message}`);
    }
  }

  async loadUsers(ip, session, params = {}) {
    try {
      const pathBase = `load_users.fcgi?session=${session}&mode=671`;
      const defaultBody = {
        limit: Number(params.limit || 100),
        offset: Number(params.offset || 0)
      };
      if (params.cpfs && params.cpfs.length > 0) {
        defaultBody.users_cpf = params.cpfs;
      }

      
      let attempts = [
        { method: 'POST', useBody: JSON.stringify(defaultBody), headers: { 'Content-Type': 'application/json' }, desc: 'JSON body' },
        { method: 'POST', useBody: JSON.stringify(params.cpfs && params.cpfs.length > 0 ? { users_cpf: params.cpfs } : {}), headers: { 'Content-Type': 'application/json' }, desc: 'empty object or users_cpf' },
        { method: 'POST', useBody: '', headers: { 'Content-Type': 'application/json' }, desc: 'empty body with Content-Type' },
        { method: 'POST', useBody: '', headers: {}, desc: 'empty body no Content-Type' }
      ];

      
      if (params.loadMethod === 'query') {
        attempts = [
          { method: 'POST', useBody: '', headers: {}, altQuery: true, desc: 'POST with query params' },
          { method: 'GET', useBody: null, headers: {}, altQuery: true, desc: 'GET with query params' },
          ...attempts
        ];
      } else {
        
        attempts.push({ method: 'POST', useBody: '', headers: {}, altQuery: true, desc: 'POST with query params' });
        attempts.push({ method: 'GET', useBody: null, headers: {}, altQuery: true, desc: 'GET with query params' });
      }

      let res = null;
      let lastErrText = '';
      const maxAttempts = attempts.length;
      let delay = 300;

      for (let i = 0; i < maxAttempts; i++) {
        const a = attempts[i];
        let attemptPath = pathBase;
        if (a.altQuery) {
          attemptPath = `${pathBase}&limit=${defaultBody.limit}&offset=${defaultBody.offset}`;
        }

        logger.info(`loadUsers attempt ${i + 1}/${maxAttempts} for ${ip}: ${a.desc}`);
        
        await new Promise(r => setTimeout(r, delay));

        try {
          if (a.method === 'GET') {
            res = await controlIdRequestHttp(attemptPath, ip, { method: 'GET', headers: a.headers });
          } else {
            res = await controlIdRequestHttp(attemptPath, ip, { method: 'POST', headers: a.headers, body: a.useBody });
          }
        } catch (e) {
          logger.warning(`loadUsers attempt error for ${ip}: ${e.message}`);
        }

        if (res && res.ok) {
          try { const d = await res.json();
            logger.info(`Usuários carregados do relógio ${ip}`, { count: d.count || 0 });
            return { count: d.count || 0, users: d.users || [] };
          } catch (e) {
            throw new Error('Resposta não é JSON válido');
          }
        }

        if (res) {
          lastErrText = await res.text().catch(() => '');
          logger.warning(`loadUsers attempt ${i + 1} failed for ${ip}: HTTP ${res.status}: ${lastErrText}`);
        }

        delay = delay * 2; // exponential backoff
      }

      // All attempts failed
      throw new Error(`HTTP ${res && res.status || 0}: ${lastErrText}`);
    } catch (error) {
      logger.error(`Erro ao carregar usuários do relógio ${ip}`, error.message);
      throw new Error(`Falha ao carregar usuários (${ip}): ${error.message}`);
    }
  }

  async addUser(ip, session, userData) {
    try {
      const path = `add_users.fcgi?session=${session}&mode=671`;
      const user = { cpf: parseInt(userData.cpf), name: userData.name, admin: userData.admin || false };
      if (userData.registration) user.registration = parseInt(userData.registration);
      if (userData.password) user.password = userData.password;
      if (userData.rfid) user.rfid = parseInt(userData.rfid);
      let extra = {};
      if (userData.image) {
        extra.image = userData.image;
        if (userData.image_timestamp) extra.image_timestamp = userData.image_timestamp;
        extra.do_match = false;
      }

      const payload = Object.assign({}, extra, { users: [user] });
      const res = await controlIdRequestHttp(path, ip, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      logger.success(`Usuário ${userData.name} adicionado no relógio ${ip}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao adicionar usuário no relógio ${ip}`, error.message);
      throw new Error(`Falha ao adicionar usuário (${ip}): ${error.message}`);
    }
  }

  async updateUser(ip, session, cpf, userData) {
    try {
      const url = `https://${ip}/update_users.fcgi?session=${session}&mode=671`;
      
      const user = {
        cpf: parseInt(cpf)
      };

      if (userData.name !== undefined) user.name = userData.name;
      if (userData.admin !== undefined) user.admin = userData.admin;
      if (userData.registration !== undefined) user.registration = parseInt(userData.registration);
      if (userData.password !== undefined) user.password = userData.password;
      if (userData.rfid !== undefined) user.rfid = parseInt(userData.rfid);
      if (userData.new_cpf !== undefined) user.new_cpf = parseInt(userData.new_cpf);

      const path = `update_users.fcgi?session=${session}&mode=671`;
      let extra = {};
      if (userData.image) {
        extra.image = userData.image;
        if (userData.image_timestamp) extra.image_timestamp = userData.image_timestamp;
        extra.do_match = false;
      }
      const payload = Object.assign({}, extra, { users: [user] });
      const res = await controlIdRequestHttp(path, ip, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      logger.success(`Usuário CPF ${cpf} atualizado no relógio ${ip}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao atualizar usuário no relógio ${ip}`, error.message);
      throw new Error(`Falha ao atualizar usuário (${ip}): ${error.message}`);
    }
  }

  async removeUser(ip, session, cpf) {
    try {
      const url = `https://${ip}/remove_users.fcgi?session=${session}`;
      
      const path = `remove_users.fcgi?session=${session}`;
      const res = await controlIdRequestHttp(path, ip, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ users: [parseInt(cpf)] }) });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      logger.success(`Usuário CPF ${cpf} removido do relógio ${ip}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao remover usuário do relógio ${ip}`, error.message);
      throw new Error(`Falha ao remover usuário (${ip}): ${error.message}`);
    }
  }

  async checkStatus(ip, username, password) {
    try {
      // Login-first using cache
      const session = await getSessionCached(ip, username, password);
      const path = `session_is_valid.fcgi?session=${session}`;
      const res = await controlIdRequestHttp(path, ip, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!res.ok) return false;
      // Optionally parse body for more info
      return true;
    } catch (error) {
      logger.warning(`checkStatus falhou para ${ip}: ${error.message}`);
      invalidateSession(ip);
      return false;
    }
  }

  async countUsers(ip, session) {
    try {
      const path = `count_users.fcgi?session=${session}`;
      const res = await controlIdRequestHttp(path, ip, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.count || 0;
    } catch (error) {
      logger.error(`Erro ao contar usuários do relógio ${ip}`, error.message);
      return 0;
    }
  }
    
  async logout(ip, session) {
    try {
      const path = `logout.fcgi?session=${session}`;
      await controlIdRequestHttp(path, ip, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      invalidateSession(ip);
      logger.info(`Logout realizado no relógio ${ip}`);
    } catch (error) {
      // Ignora erros no logout
      logger.warning(`Erro ao fazer logout no relógio ${ip}`, error.message);
    }
  }
}

module.exports = new ControlIdService();