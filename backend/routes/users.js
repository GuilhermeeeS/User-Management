

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { authMiddleware } = require('../middleware/authMiddleware');
const controlidService = require('../services/controlidService');
const logger = require('../utils/logger');
const router = express.Router();

let devices = [];
async function loadDevices() {
  try {
    const data = await fs.readFile(path.join(__dirname, '../data/ips.json'), 'utf8');
    const config = JSON.parse(data);
    devices = config.devices;
  } catch (error) {
    logger.error('Erro ao carregar configuração de relógios', error.message);
    devices = [];
  }
}
loadDevices();


async function executeOnAllDevices(operation, operationName) {
  const results = [];
  const logs = [];

  logs.push({
    timestamp: new Date().toISOString(),
    type: 'info',
    message: `Iniciando ${operationName} em ${devices.length} relógios...`
  });

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    let session = null;

    try {
      logs.push({
        timestamp: new Date().toISOString(),
        type: 'progress',
        message: `Conectando ao ${device.name} (${device.ip})... [${i + 1}/${devices.length}]`
      });

      session = await controlidService.login(device.ip, device.login, device.password);

      const result = await operation(device, session);

      logs.push({
        timestamp: new Date().toISOString(),
        type: 'success',
        message: `✓ ${device.name} concluído com sucesso [${i + 1}/${devices.length}]`
      });

      results.push({
        device: device.name,
        ip: device.ip,
        success: true,
        result
      });

    } catch (error) {
      logs.push({
        timestamp: new Date().toISOString(),
        type: 'error',
        message: `✗ Erro no ${device.name}: ${error.message} [${i + 1}/${devices.length}]`
      });

      results.push({
        device: device.name,
        ip: device.ip,
        success: false,
        error: error.message
      });
    } finally {
      if (session) {
        try {
          await controlidService.logout(device.ip, session);
        } catch (e) {
        }
      }
    }
  }

  logs.push({
    timestamp: new Date().toISOString(),
    type: 'complete',
    message: `✅ ${operationName} finalizado!`
  });

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return {
    success: failCount === 0,
    summary: {
      total: devices.length,
      success: successCount,
      failed: failCount
    },
    results,
    logs
  };
}

router.get('/users', authMiddleware, async (req, res) => {
  try {
    const { limit = 100, offset = 0, search = '' } = req.query;

    if (devices.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Nenhum relógio configurado'
      });
    }

    const device = devices[0]; // Usa primeiro relógio como referência
    let session = null;

    try {
      session = await controlidService.login(device.ip, device.login, device.password);
      
      const data = await controlidService.loadUsers(device.ip, session, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        loadMethod: device.load_method
      });

      // Filtra por busca se informado
      let users = data.users;
      if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(user => 
          user.name.toLowerCase().includes(searchLower) ||
          (user.cpf && user.cpf.toString().includes(search))
        );
      }

      // Update snapshot cache on success
      try {
        await fs.writeFile(path.join(__dirname, '../data/users_cache.json'), JSON.stringify({ count: data.count, users: data.users }, null, 2), 'utf8');
      } catch (cacheErr) {
        logger.warning('Falha ao atualizar cache de usuários', cacheErr.message);
      }

      // Return live data
      return res.json({
        success: true,
        data: {
          count: data.count,
          users: users,
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        }
      });

    } catch (error) {
      if (session) {
        await controlidService.logout(device.ip, session);
      }
      try {
        const cached = await fs.readFile(path.join(__dirname, '../data/users_cache.json'), 'utf8');
        const obj = JSON.parse(cached);
        return res.json({ success: true, data: { count: obj.count, users: obj.users, pagination: { limit: parseInt(limit), offset: parseInt(offset) } }, cached: true });
      } catch (cacheErr) {
        throw error; 
      }
    }

  } catch (error) {
    logger.error('Erro ao listar usuários', error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/users/:cpf', authMiddleware, async (req, res) => {
  try {
    const { cpf } = req.params;

    if (devices.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Nenhum relógio configurado'
      });
    }

    const device = devices[0];
    let session = null;

    try {
      session = await controlidService.login(device.ip, device.login, device.password);
      
      const data = await controlidService.loadUsers(device.ip, session, {
        cpfs: [parseInt(cpf)],
        loadMethod: device.load_method
      });

      // Do not logout here to avoid invalidating cached session used by other concurrent requests.
      if (data.users.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      return res.json({
        success: true,
        data: data.users[0]
      });

    } catch (error) {
      if (session) {
        await controlidService.logout(device.ip, session);
      }
      throw error;
    }

  } catch (error) {
    logger.error('Erro ao buscar usuário', error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/users', authMiddleware, async (req, res) => {
  try {
    const userData = req.body;

    // Validações básicas
    if (!userData.cpf || !userData.name) {
      return res.status(400).json({
        success: false,
        message: 'CPF e Nome são obrigatórios'
      });
    }

    
    const cpfStr = userData.cpf.toString().replace(/\D/g, '');
    if (cpfStr.length !== 11) {
      return res.status(400).json({
        success: false,
        message: 'CPF deve conter 11 dígitos'
      });
    }

    logger.info('Iniciando adição de usuário em todos os relógios', { cpf: userData.cpf, name: userData.name });

    const result = await executeOnAllDevices(
      async (device, session) => {
        return await controlidService.addUser(device.ip, session, userData);
      },
      'Adição de usuário'
    );

    return res.json(result);

  } catch (error) {
    logger.error('Erro ao adicionar usuário', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erro ao adicionar usuário',
      details: error.message
    });
  }
});

router.put('/users/:cpf', authMiddleware, async (req, res) => {
  try {
    const { cpf } = req.params;
    const userData = req.body;

    logger.info('Iniciando atualização de usuário em todos os relógios', { cpf });

    const result = await executeOnAllDevices(
      async (device, session) => {
        return await controlidService.updateUser(device.ip, session, cpf, userData);
      },
      'Atualização de usuário'
    );

    return res.json(result);

  } catch (error) {
    logger.error('Erro ao atualizar usuário', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar usuário',
      details: error.message
    });
  }
});

router.delete('/users/:cpf', authMiddleware, async (req, res) => {
  try {
    const { cpf } = req.params;

    logger.info('Iniciando remoção de usuário em todos os relógios', { cpf });

    const result = await executeOnAllDevices(
      async (device, session) => {
        return await controlidService.removeUser(device.ip, session, cpf);
      },
      'Remoção de usuário'
    );

    return res.json(result);

  } catch (error) {
    logger.error('Erro ao remover usuário', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erro ao remover usuário',
      details: error.message
    });
  }
});

router.get('/devices/status', authMiddleware, async (req, res) => {
  try {
    const statuses = await Promise.all(
      devices.map(async (device) => {
    const isOnline = await controlidService.checkStatus(device.ip, device.login, device.password);
        return {
          id: device.id,
          name: device.name,
          ip: device.ip,
          online: isOnline
        };
      })
    );

    return res.json({
      success: true,
      devices: statuses
    });

  } catch (error) {
    logger.error('Erro ao verificar status dos relógios', error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/users/delete', authMiddleware, async (req, res) => {
  try {
    const { users } = req.body;
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ success: false, message: 'Campo users deve ser um array com ao menos um CPF' });
    }

    logger.info('Iniciando remoção em lote de usuários', { count: users.length });

    const result = await executeOnAllDevices(
      async (device, session) => {
        const outcomes = [];
        // remover sequencialmente por dispositivo para evitar sobreposição
        for (const cpf of users) {
          try {
            await controlidService.removeUser(device.ip, session, cpf);
            outcomes.push({ cpf, success: true });
          } catch (e) {
            outcomes.push({ cpf, success: false, error: e.message });
          }
        }
        return outcomes;
      },
      'Remoção em lote de usuários'
    );

    return res.json(result);
  } catch (error) {
    logger.error('Erro ao remover usuários em lote', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
