const db = require('../config/db');

async function createUser({ email, passwordHash, fullName }) {
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, full_name, role, email_verified_at, created_at`,
    [email, passwordHash, fullName]
  );
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT id, email, full_name, role, email_verified_at, created_at FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function markEmailVerified(userId) {
  await db.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [userId]);
}

async function updatePassword(userId, passwordHash) {
  await db.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
    passwordHash,
    userId,
  ]);
}

async function addAuthIdentity({ userId, provider, providerUid }) {
  await db.query(
    `INSERT INTO auth_identities (user_id, provider, provider_uid)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, provider_uid) DO NOTHING`,
    [userId, provider, providerUid]
  );
}

async function findByAuthIdentity(provider, providerUid) {
  const { rows } = await db.query(
    `SELECT u.* FROM users u
     JOIN auth_identities ai ON ai.user_id = u.id
     WHERE ai.provider = $1 AND ai.provider_uid = $2`,
    [provider, providerUid]
  );
  return rows[0] || null;
}

// Flujo de login social: si ya existe una identidad (provider, providerUid),
// entra con esa cuenta. Si no, pero el correo ya existe (p.ej. se registró
// con contraseña), vincula el proveedor a esa cuenta existente. Si tampoco
// existe el correo, crea un usuario nuevo sin contraseña (solo login social).
async function findOrCreateOAuthUser({ provider, providerUid, email, fullName, emailVerified }) {
  const existingIdentity = await findByAuthIdentity(provider, providerUid);
  if (existingIdentity) return existingIdentity;

  const existingByEmail = email ? await findByEmail(email) : null;
  if (existingByEmail) {
    await addAuthIdentity({ userId: existingByEmail.id, provider, providerUid });
    return existingByEmail;
  }

  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, email_verified_at)
     VALUES ($1, NULL, $2, $3)
     RETURNING *`,
    [email || null, fullName || (email ? email.split('@')[0] : provider), emailVerified ? new Date() : null]
  );
  const user = rows[0];
  await addAuthIdentity({ userId: user.id, provider, providerUid });
  return user;
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  markEmailVerified,
  updatePassword,
  addAuthIdentity,
  findByAuthIdentity,
  findOrCreateOAuthUser,
};
