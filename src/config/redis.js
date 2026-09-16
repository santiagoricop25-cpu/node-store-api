const Redis = require('ioredis');

// Usado para la "lista blanca" de refresh tokens vigentes — así un logout
// o una contraseña cambiada puede invalidar sesiones de inmediato,
// algo que un JWT por sí solo no permite.
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.error('[redis] error de conexión:', err.message);
});

module.exports = redis;
