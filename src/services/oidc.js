const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Verificador genérico de id_token OIDC (Google y Apple firman con RS256 y
// publican sus llaves públicas en un JWKS) — evita repetir esta lógica dos veces.
const clientsByJwksUri = new Map();

function getClient(jwksUri) {
  if (!clientsByJwksUri.has(jwksUri)) {
    clientsByJwksUri.set(
      jwksUri,
      jwksClient({
        jwksUri,
        cache: true,
        cacheMaxAge: 12 * 60 * 60 * 1000, // 12h
        rateLimit: true,
      })
    );
  }
  return clientsByJwksUri.get(jwksUri);
}

function getSigningKey(jwksUri, kid) {
  return new Promise((resolve, reject) => {
    getClient(jwksUri).getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

// Verifica firma + issuer + audience + expiración de un id_token OIDC.
// No comprueba nonce aquí porque no usamos implicit flow — el code se
// intercambia servidor a servidor, que ya es la parte que importa contra CSRF.
async function verifyIdToken(idToken, { jwksUri, issuer, audience }) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded) throw new Error('id_token_malformed');

  const publicKey = await getSigningKey(jwksUri, decoded.header.kid);
  return jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer,
    audience,
  });
}

module.exports = { verifyIdToken };
