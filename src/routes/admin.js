const express = require('express');

const db = require('../config/db');
const orders = require('../models/orderModel');
const presence = require('../services/presence');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

router.use('/admin', requireAuth, requireAdmin);

// GET /admin/stats — números para las tarjetas del dashboard.
router.get('/admin/stats', async (req, res) => {
  const [orderStats, onlineNow] = await Promise.all([orders.stats(), presence.countOnline()]);
  res.json({
    ...orderStats,
    onlineNow, // null si Redis no respondió — el frontend lo muestra como "—"
  });
});

// GET /admin/online-count — el dashboard hace polling a este endpoint aparte
// (más liviano que /admin/stats) para refrescar el contador "en línea ahora".
router.get('/admin/online-count', async (req, res) => {
  const onlineNow = await presence.countOnline();
  res.json({ onlineNow });
});

// GET /admin/users?search=&page=
router.get('/admin/users', async (req, res) => {
  const { search, page = 1 } = req.query;
  const pageSize = 20;
  const clauses = [];
  const params = [];
  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    clauses.push(`(lower(email) LIKE $${params.length} OR lower(full_name) LIKE $${params.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const { rows: countRows } = await db.query(`SELECT count(*)::int AS total FROM users ${where}`, params);
  const total = countRows[0]?.total || 0;

  params.push(pageSize, (Number(page) - 1) * pageSize);
  const { rows } = await db.query(
    `SELECT id, email, full_name, role, email_verified_at, created_at
     FROM users ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ users: rows, total, page: Number(page), pageSize });
});

module.exports = router;
