const db = require('../config/db');

function toPublic(row, items = []) {
  if (!row) return null;
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    customer: {
      name: row.guest_name,
      email: row.guest_email,
      phone: row.guest_phone,
    },
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    shippingAddress: row.shipping_address,
    subtotal: row.subtotal,
    tax: row.tax,
    shippingCost: row.shipping_cost,
    total: row.total,
    trackingNumber: row.tracking_number,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((it) => ({
      productId: it.product_id,
      title: it.title,
      image: it.image_url,
      price: it.price,
      quantity: it.quantity,
    })),
  };
}

// Crea la orden y sus items en una sola transacción — si algo falla a mitad
// de camino, no queremos una orden fantasma sin productos.
async function create({ userId, customer, items, shippingAddress, paymentMethod, notes }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const shippingCost = subtotal >= 150000 ? 0 : 12900;
    const tax = Math.round(subtotal * 0.19);
    const total = subtotal + tax + shippingCost;

    const { rows } = await client.query(
      `INSERT INTO orders
        (user_id, guest_name, guest_email, guest_phone, payment_method, shipping_address, subtotal, tax, shipping_cost, total, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId || null,
        customer?.name || null,
        customer?.email || null,
        customer?.phone || null,
        paymentMethod || 'contra_entrega',
        JSON.stringify(shippingAddress),
        subtotal,
        tax,
        shippingCost,
        total,
        notes || null,
      ]
    );
    const order = rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, title, image_url, price, quantity)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, it.productId, it.title, it.image || null, it.price, it.quantity]
      );
    }

    await client.query('COMMIT');
    return toPublic(order, items.map((it) => ({
      product_id: it.productId,
      title: it.title,
      image_url: it.image,
      price: it.price,
      quantity: it.quantity,
    })));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getItems(orderId) {
  const { rows } = await db.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
  return rows;
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const items = await getItems(id);
  return toPublic(rows[0], items);
}

async function listForUser(userId) {
  const { rows } = await db.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  const withItems = await Promise.all(rows.map(async (r) => toPublic(r, await getItems(r.id))));
  return withItems;
}

// Listado admin con filtros + paginación simple.
async function listAll({ status, paymentStatus, search, page = 1, pageSize = 20 } = {}) {
  const clauses = [];
  const params = [];

  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (paymentStatus) {
    params.push(paymentStatus);
    clauses.push(`payment_status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`(lower(order_number) LIKE $${params.length} OR lower(guest_email) LIKE $${params.length} OR lower(guest_name) LIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (Math.max(1, page) - 1) * pageSize;

  const { rows: countRows } = await db.query(`SELECT count(*)::int AS total FROM orders ${where}`, params);
  const total = countRows[0]?.total || 0;

  params.push(pageSize, offset);
  const { rows } = await db.query(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const withItems = await Promise.all(rows.map(async (r) => toPublic(r, await getItems(r.id))));
  return { orders: withItems, total, page, pageSize };
}

async function updateStatus(id, { status, paymentStatus, trackingNumber, notes }) {
  const fields = [];
  const params = [];
  if (status !== undefined) {
    params.push(status);
    fields.push(`status = $${params.length}`);
  }
  if (paymentStatus !== undefined) {
    params.push(paymentStatus);
    fields.push(`payment_status = $${params.length}`);
  }
  if (trackingNumber !== undefined) {
    params.push(trackingNumber);
    fields.push(`tracking_number = $${params.length}`);
  }
  if (notes !== undefined) {
    params.push(notes);
    fields.push(`notes = $${params.length}`);
  }
  if (!fields.length) return findById(id);

  params.push(id);
  await db.query(`UPDATE orders SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  return findById(id);
}

async function stats() {
  const { rows } = await db.query(`
    SELECT
      (SELECT count(*)::int FROM orders) AS total_orders,
      (SELECT count(*)::int FROM orders WHERE created_at >= date_trunc('day', now())) AS orders_today,
      (SELECT count(*)::int FROM orders WHERE status = 'pendiente') AS orders_pending,
      (SELECT count(*)::int FROM orders WHERE payment_status = 'pendiente') AS payments_pending,
      (SELECT COALESCE(sum(total), 0)::int FROM orders WHERE payment_status = 'pagado') AS revenue_total,
      (SELECT COALESCE(sum(total), 0)::int FROM orders WHERE payment_status = 'pagado' AND created_at >= date_trunc('day', now())) AS revenue_today,
      (SELECT count(*)::int FROM users) AS total_users
  `);
  return rows[0];
}

module.exports = { create, findById, listForUser, listAll, updateStatus, stats, toPublic };
