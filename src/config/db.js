const { Pool } = require('pg');

// Un único pool de conexiones compartido por toda la API.
// DATABASE_URL viene de las variables de entorno (ver .env.example).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[db] Error inesperado en un cliente inactivo del pool', err);
});

module.exports = {
  // Helper simple para queries puntuales: db.query('SELECT ...', [valores])
  query: (text, params) => pool.query(text, params),
  pool,
};
