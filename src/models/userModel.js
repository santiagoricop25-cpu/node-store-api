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

module.exports = {
  createUser,
  findByEmail,
  findById,
  markEmailVerified,
  updatePassword,
  addAuthIdentity,
};
