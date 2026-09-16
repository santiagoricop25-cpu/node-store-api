const { verifyAccessToken } = require('../services/tokens');

// Protege una ruta: exige un Authorization: Bearer <access_token> válido.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'no_token' });
  }

  try {
    req.user = verifyAccessToken(token); // { sub, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_or_expired_token' });
  }
}

// Además de estar logueado, exige rol admin — para todo lo que monte /admin más adelante.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
