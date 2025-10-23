require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;


// CORS - Permite requisições do frontend
app.use(cors({
  origin: '*', // Em produção, especifique o domínio do frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

app.use(express.static(path.join(__dirname, '../frontend')));


app.use('/api', authRoutes);
app.use('/api', usersRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Sistema Control iD está online',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const logs = logger.getRecent(limit);
  res.json({
    success: true,
    logs
  });
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada'
  });
});


app.use((err, req, res, next) => {
  logger.error('Erro não tratado', {
    message: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erro interno do servidor'
  });
});


if (!process.env.PASSWORD_HASH) {
  console.error('ERRO: PASSWORD_HASH não está configurado no arquivo .env');
  console.error('Execute: npm run generate-hash');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                      ║');
  console.log('║       Sistema de Gestão Control iD - INICIADO        ║');
  console.log('║                                                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Servidor rodando em: http://localhost:${PORT}`);
  logger.success('Servidor iniciado com sucesso', { port: PORT });
});

process.on('SIGINT', () => {
  console.log('\n\n🛑 Encerrando servidor...');
  logger.info('Servidor encerrado pelo usuário');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Encerrando servidor...');
  logger.info('Servidor encerrado');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada', { reason, promise });
  console.error('Erro não tratado:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Exceção não capturada', { error: error.message, stack: error.stack });
  console.error('Erro crítico:', error);
  process.exit(1);
});

module.exports = app;