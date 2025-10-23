

const logger = require('../utils/logger');

const activeSessions = new Set();

function generateSessionToken() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createSession() {
  const token = generateSessionToken();
  activeSessions.add(token);
  logger.info('Nova sessão criada', { token });
  return token;
}

function isValidSession(token) {
  return activeSessions.has(token);
}

function destroySession(token) {
  activeSessions.delete(token);
  logger.info('Sessão destruída', { token });
}

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      logger.warning('Acesso negado: Token não fornecido', { 
        path: req.path,
        method: req.method 
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Token de autenticação não fornecido' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!isValidSession(token)) {
      logger.warning('Acesso negado: Token inválido', { 
        path: req.path,
        method: req.method,
        token 
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Token de autenticação inválido ou expirado' 
      });
    }

    req.sessionToken = token;
    next();
  } catch (error) {
    logger.error('Erro no middleware de autenticação', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Erro ao validar autenticação' 
    });
  }
}

function optionalAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      if (isValidSession(token)) {
        req.sessionToken = token;
        req.authenticated = true;
      } else {
        req.authenticated = false;
      }
    } else {
      req.authenticated = false;
    }
    
    next();
  } catch (error) {
    req.authenticated = false;
    next();
  }
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  createSession,
  isValidSession,
  destroySession,
  cleanupSessions
};