const db = require('../config/db');

async function createEmailVerificationToken(userId, token, expiresAt) {
  await db.query(
    `INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
}

async function consumeEmailVerificationToken(token) {
  const { rows } = await db.query(
    `DELETE FROM email_verification_tokens
     WHERE token = $1 AND expires_at > now()
     RETURNING user_id`,
    [token]
  );
  return rows[0]?.user_id || null;
}

async function createPasswordResetToken(userId, token, expiresAt) {
  await db.query(
    `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
}

async function consumePasswordResetToken(token) {
  const { rows } = await db.query(
    `UPDATE password_reset_tokens
     SET used_at = now()
     WHERE token = $1 AND expires_at > now() AND used_at IS NULL
     RETURNING user_id`,
    [token]
  );
  return rows[0]?.user_id || null;
}

module.exports = {
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  createPasswordResetToken,
  consumePasswordResetToken,
};
