const crypto = require('crypto');
const { verifyIdToken } = require('./oidc');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

function redirectUri() {
  return `${process.env.API_ORIGIN}/auth/google/callback`;
}

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new Error(`google_token_exchange_failed: ${await res.text()}`);
  }
  return res.json(); // { id_token, access_token, ... }
}

async function verifyGoogleIdToken(idToken) {
  const payload = await verifyIdToken(idToken, {
    jwksUri: JWKS_URI,
    issuer: ISSUERS,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return {
    providerUid: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    fullName: payload.name || payload.email,
  };
}

function randomState() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { buildAuthUrl, exchangeCode, verifyGoogleIdToken, randomState };
