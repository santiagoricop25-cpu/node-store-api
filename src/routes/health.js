const express = require('express');
const db = require('../config/db');

const router = express.Router();

// GET /health — usado para verificar que la API y la base de datos están vivas.
// Este es el endpoint que confirmamos en producción al cerrar la Fase 00.
router.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch (err) {
    console.error('[health] error de base de datos:', err.message);
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

module.exports = router;
