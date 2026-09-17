const express = require('express');
const presence = require('../services/presence');

const router = express.Router();

// POST /presence/ping { visitorId } — el frontend público (tienda) llama
// esto cada ~30s con un id anónimo por pestaña (generado y guardado en
// localStorage, no identifica a la persona) para que el panel de admin
// pueda mostrar "usuarios en línea ahora" sin necesitar login ni websockets.
router.post('/presence/ping', async (req, res) => {
  const visitorId = String(req.body?.visitorId || '').slice(0, 100);
  if (!visitorId) return res.status(400).json({ error: 'missing_visitor_id' });
  await presence.touch(visitorId);
  res.status(204).end();
});

module.exports = router;
