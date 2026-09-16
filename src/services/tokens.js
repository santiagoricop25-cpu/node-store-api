const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TTL = '15m';
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

// El refresh token es un JWT normal, pero además guardamos su "jti" en Redis
// (ver config/redis.js) — así podemos revocarlo en un logout sin esperar
// a que expire por sí solo.
function signRefreshToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { sub: user.id, jti },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL_SECONDS }
  );
  return { token, jti };
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

// Tokens de un solo uso para verificar correo / resetear contraseña —
// no son JWT, son simplemente aleatorios e imposibles de adivinar.
function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  ACCESS_TTL,
  REFRESH_TTL_SECONDS,
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  randomToken,
};
