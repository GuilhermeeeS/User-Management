

const express = require('express');
const bcrypt = require('bcryptjs');
const { createSession, destroySession, authMiddleware } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      logger.warning('Tentativa de login sem senha');
      return res.status(400).json({
        success: false,
        message: 'Senha não fornecida'
      });
    }

    const passwordHash = process.env.PASSWORD_HASH;
    const isValid = await bcrypt.compare(password, passwordHash);

    if (!isValid) {
      logger.warning('Tentativa de login com senha incorreta');
      return res.status(401).json({
        success: false,
        message: 'Senha incorreta'
      });
    }

    // Login bem-sucedido - cria sessão
    const token = createSession();
    logger.success('Login realizado com sucesso');

    return res.json({
      success: true,
      token: token,
      message: 'Login realizado com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao processar login', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao processar login'
    });
  }
});

router.post('/logout', authMiddleware, (req, res) => {
  try {
    const token = req.sessionToken;
    destroySession(token);
    
    logger.success('Logout realizado com sucesso');
    
    return res.json({
      success: true,
      message: 'Logout realizado com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao processar logout', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao processar logout'
    });
  }
});

router.get('/verify', authMiddleware, (req, res) => {
  return res.json({
    success: true,
    authenticated: true
  });
});

module.exports = router;