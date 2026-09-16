const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { verifyIdToken } = require('./oidc');

const AUTH_URL = 'https://appleid.apple.com/auth/authorize';
const TOKEN_URL = 'https://appleid.apple.com/auth/token';
const JWKS_URI = 'https://appleid.apple.com/auth/keys';
const ISSUER = 'https://appleid.apple.com';

function redirectUri() {
  return `${process.env.API_ORIGIN}/auth/apple/callback`;
}

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.APPLE_SERVICES_ID,
    redirect_uri: redirectUri(),
    response_type: 'code id_token',
    response_mode: 'form_post', // obligatorio cuando se pide "name email"
    scope: 'name email',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// Apple no usa un client_secret fijo — hay que firmar un JWT de corta duración
// con la llave privada (.p8) descargada de developer.apple.com, cada vez que
// se necesita hablar con su endpoint de token.
function generateClientSecret() {
  const privateKey = (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return jwt.sign(
    {
      iss: process.env.APPLE_TEAM_ID,
      aud: ISSUER,
      sub: process.env.APPLE_SERVICES_ID,
    },
    privateKey,
    {
      algorithm: 'ES256',
      expiresIn: '5m',
      keyid: process.env.APPLE_KEY_ID,
    }
  );
}

async function exchangeCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.APPLE_SERVICES_ID,
      client_secret: generateClientSecret(),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new Error(`apple_token_exchange_failed: ${await res.text()}`);
  }
  return res.json(); // { id_token, access_token, ... }
}

async function verifyAppleIdToken(idToken) {
  const payload = await verifyIdToken(idToken, {
    jwksUri: JWKS_URI,
    issuer: ISSUER,
    audience: process.env.APPLE_SERVICES_ID,
  });
  return {
    providerUid: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
  };
}

function randomState() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { buildAuthUrl, exchangeCode, verifyAppleIdToken, randomState };
