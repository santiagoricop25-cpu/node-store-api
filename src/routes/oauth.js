const express = require('express');
const rateLimit = require('express-rate-limit');

const users = require('../models/userModel');
const redis = require('../config/redis');
const google = require('../services/oauthGoogle');
const apple = require('../services/oauthApple');
const { signAccessToken, signRefreshToken, REFRESH_TTL_SECONDS } = require('../services/tokens');

const router = express.Router();

const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const REFRESH_COOKIE = 'refresh_token';
const STATE_COOKIE = 'oauth_state';
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

// Crea la sesión (access + refresh) igual que en auth.js, pero en vez de
// devolver JSON, genera un código de un solo uso — porque esta respuesta es
// una redirección de vuelta al navegador, no un fetch() que el frontend
// pueda leer directamente.
async function issueOneTimeLoginCode(res, user) {
  const { token: refreshToken, jti } = signRefreshToken(user);
  await redis.set(`refresh:${jti}`, user.id, 'EX', REFRESH_TTL_SECONDS);
  setRefreshCookie(res, refreshToken);

  const crypto = require('crypto');
  const code = crypto.randomBytes(24).toString('hex');
  await redis.set(`oauth_code:${code}`, user.id, 'EX', 60); // válido 60s, un solo uso
  return code;
}

function frontendCallbackUrl(code) {
  return `${process.env.FRONTEND_ORIGIN}/oauth/callback?code=${code}`;
}

function frontendErrorUrl(reason) {
  return `${process.env.FRONTEND_ORIGIN}/oauth/callback?error=${encodeURIComponent(reason)}`;
}

// El frontend cambia el código de un solo uso por el accessToken real —
// así el token nunca aparece en la URL de forma persistente ni en logs del navegador.
router.post('/auth/oauth/exchange', oauthLimiter, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'missing_code' });

  const userId = await redis.get(`oauth_code:${code}`);
  if (!userId) return res.status(400).json({ error: 'invalid_or_expired_code' });
  await redis.del(`oauth_code:${code}`);

  const user = await users.findById(userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const accessToken = signAccessToken(user);
  res.json({ accessToken, user });
});

// --- Google ---------------------------------------------------------------

router.get('/auth/google', oauthLimiter, (req, res) => {
  const state = google.randomState();
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 5 * 60 * 1000,
    path: '/auth/google',
  });
  res.redirect(google.buildAuthUrl(state));
});

router.get('/auth/google/callback', oauthLimiter, async (req, res) => {
  const { code, state, error } = req.query;
  const expectedState = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: '/auth/google' });

  if (error) return res.redirect(frontendErrorUrl(String(error)));
  if (!code || !state || state !== expectedState) {
    return res.redirect(frontendErrorUrl('invalid_state'));
  }

  try {
    const tokenSet = await google.exchangeCode(String(code));
    const profile = await google.verifyGoogleIdToken(tokenSet.id_token);
    const user = await users.findOrCreateOAuthUser({
      provider: 'google',
      providerUid: profile.providerUid,
      email: profile.email,
      fullName: profile.fullName,
      emailVerified: profile.emailVerified,
    });
    const loginCode = await issueOneTimeLoginCode(res, user);
    res.redirect(frontendCallbackUrl(loginCode));
  } catch (err) {
    console.error('[oauth:google]', err);
    res.redirect(frontendErrorUrl('google_login_failed'));
  }
});

// --- Apple ------------------------------------------------------------------
// Apple responde con un POST (form_post) porque pedimos el scope "name email".

router.get('/auth/apple', oauthLimiter, (req, res) => {
  const state = apple.randomState();
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'none', // la cookie debe viajar de vuelta tras el POST cross-site de Apple
    maxAge: 5 * 60 * 1000,
    path: '/auth/apple',
  });
  res.redirect(apple.buildAuthUrl(state));
});

router.post(
  '/auth/apple/callback',
  oauthLimiter,
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const { code, state, error, user: userJson } = req.body || {};
    const expectedState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/auth/apple' });

    if (error) return res.redirect(frontendErrorUrl(String(error)));
    if (!code || !state || state !== expectedState) {
      return res.redirect(frontendErrorUrl('invalid_state'));
    }

    try {
      const tokenSet = await apple.exchangeCode(String(code));
      const profile = await apple.verifyAppleIdToken(tokenSet.id_token);

      // Apple solo manda el nombre la primera vez que el usuario autoriza la app,
      // como un JSON aparte en el body — después nunca más lo vuelve a enviar.
      let fullName = profile.email;
      if (userJson) {
        try {
          const parsed = JSON.parse(userJson);
          const name = [parsed?.name?.firstName, parsed?.name?.lastName].filter(Boolean).join(' ');
          if (name) fullName = name;
        } catch (_) {
          // ignorar JSON inválido — nos quedamos con el fallback
        }
      }

      const user = await users.findOrCreateOAuthUser({
        provider: 'apple',
        providerUid: profile.providerUid,
        email: profile.email,
        fullName,
        emailVerified: profile.emailVerified,
      });
      const loginCode = await issueOneTimeLoginCode(res, user);
      res.redirect(frontendCallbackUrl(loginCode));
    } catch (err) {
      console.error('[oauth:apple]', err);
      res.redirect(frontendErrorUrl('apple_login_failed'));
    }
  }
);

module.exports = router;
