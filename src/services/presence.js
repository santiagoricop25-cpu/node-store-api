const redis = require('../config/redis');

const PRESENCE_TTL_SECONDS = 90; // el frontend hace ping cada 30s — 3 pings de margen
const PREFIX = 'presence:';

// El frontend llama esto (POST /presence/ping) cada 30s mientras alguien
// tiene la tienda abierta. Guardamos una clave con vencimiento corto en
// Redis; contar cuántas siguen vivas equivale a "usuarios en línea ahora".
async function touch(visitorId) {
  try {
    await redis.set(`${PREFIX}${visitorId}`, Date.now(), 'EX', PRESENCE_TTL_SECONDS);
  } catch (err) {
    // Si Redis falla no queremos tumbar la petición del visitante — el
    // contador del panel simplemente sale un poco desactualizado.
    console.error('[presence] no se pudo registrar:', err.message);
  }
}

// SCAN en vez de KEYS: no bloquea Redis aunque el set de claves crezca.
async function countOnline() {
  try {
    let cursor = '0';
    let count = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 200);
      cursor = next;
      count += keys.length;
    } while (cursor !== '0');
    return count;
  } catch (err) {
    console.error('[presence] no se pudo contar:', err.message);
    return null;
  }
}

module.exports = { touch, countOnline, PRESENCE_TTL_SECONDS };
