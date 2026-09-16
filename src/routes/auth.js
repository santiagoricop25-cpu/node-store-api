const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const users = require('../models/userModel');
const tokens = require('../models/tokenModel');
const redis = require('../config/redis');
const mailer = require('../services/mailer');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TTL_SECONDS,
  randomToken,
} = require('../services/tokens');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

// Login/registro son el blanco favorito de la fuerza bruta — límite mucho
// más estricto que el general de la app.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

const REFRESH_COOKIE = 'refresh_token';
const isProd = process.env.NODE_ENV === 'production';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: REFRESH_TTL_SECONDS * 1000,
    path: '/auth',
  });
}

async function issueSession(res, user) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, jti } = signRefreshToken(user);

  // Guardamos el jti en Redis con el mismo TTL del refresh token —
  // si no está ahí, el refresh token se considera revocado aunque no haya expirado.
  await redis.set(`refresh:${jti}`, user.id, 'EX', REFRESH_TTL_SECONDS);

  setRefreshCookie(res, refreshToken);
  return accessToken;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  fullName: z.string().min(2),
});

// POST /auth/register
router.post('/auth/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const { email, password, fullName } = parsed.data;

  const existing = await users.findByEmail(email);
  if (existing) {
    // No revelamos si el correo ya existe por seguridad — mensaje genérico.
    return res.status(409).json({ error: 'email_in_use' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await users.createUser({ email, passwordHash, fullName });
  await users.addAuthIdentity({ userId: user.id, provider: 'email', providerUid: user.id });

  const verifyToken = randomToken();
  await tokens.createEmailVerificationToken(
    verifyToken,
    user.id,
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );
  const verifyUrl = `${process.env.FRONTEND_ORIGIN}/verificar-correo?token=${verifyToken}`;
  await mailer.sendVerificationEmail(email, verifyUrl);

  const accessToken = await issueSession(res, user);
  res.status(201).json({ user, accessToken });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /auth/login
router.post('/auth/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error' });
  }
  const { email, password } = parsed.data;

  const user = await users.findByEmail(email);
  // Mismo mensaje de error tanto si el correo no existe como si la contraseña
  // es incorrecta — no le decimos a un atacante cuál de las dos falló.
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const safeUser = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    email_verified_at: user.email_verified_at,
  };
  const accessToken = await issueSession(res, safeUser);
  res.json({ user: safeUser, accessToken });
});

// POST /auth/refresh — el frontend lo llama cuando el access token expira (cada 15 min).
router.post('/auth/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'no_refresh_token' });
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'invalid_refresh_token' });
  }

  const stillValid = await redis.get(`refresh:${payload.jti}`);
  if (!stillValid) {
    return res.status(401).json({ error: 'session_revoked' });
  }

  const user = await users.findById(payload.sub);
  if (!user) {
    return res.status(401).json({ error: 'user_not_found' });
  }

  // Rotamos el refresh token en cada uso: el viejo jti se invalida,
  // así uno robado deja de servir en cuanto el dueño real vuelve a refrescar.
  await redis.del(`refresh:${payload.jti}`);
  const accessToken = await issueSession(res, user);
  res.json({ accessToken });
});

// POST /auth/logout
router.post('/auth/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await redis.del(`refresh:${payload.jti}`);
    } catch (err) {
      // token ya inválido/expirado — no pasa nada, igual limpiamos la cookie.
    }
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  res.status(204).end();
});

// GET /auth/me — para que el frontend sepa quién está logueado al cargar la app.
router.get('/auth/me', requireAuth, async (req, res) => {
  const user = await users.findById(req.user.sub);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  res.json({ user });
});

// GET /auth/verify-email?token=...
router.get('/auth/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'missing_token' });

  const userId = await tokens.consumeEmailVerificationToken(String(token));
  if (!userId) return res.status(400).json({ error: 'invalid_or_expired_token' });

  await users.markEmailVerified(userId);
  res.json({ status: 'verified' });
});

const forgotSchema = z.object({ email: z.string().email() });

// POST /auth/forgot-password
router.post('/auth/forgot-password', authLimiter, async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'validation_error' });

  const user = await users.findByEmail(parsed.data.email);
  // Siempre respondemos 200 exista o no el correo — evita que alguien
  // use este endpoint para averiguar qué correos están registrados.
  if (user) {
    const resetToken = randomToken();
    await tokens.createPasswordResetToken(resetToken, user.id, new Date(Date.now() + 60 * 60 * 1000));
    const resetUrl = `${process.env.FRONTEND_ORIGIN}/restablecer-contrasena?token=${resetToken}`;
    await mailer.sendPasswordResetEmail(user.email, resetUrl);
  }
  res.json({ status: 'ok' });
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

// POST /auth/reset-password
router.post('/auth/reset-password', authLimiter, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'validation_error' });

  const userId = await tokens.consumePasswordResetToken(parsed.data.token);
  if (!userId) return res.status(400).json({ error: 'invalid_or_expired_token' });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await users.updatePassword(userId, passwordHash);
  res.json({ status: 'password_updated' });
});

module.exports = router;
