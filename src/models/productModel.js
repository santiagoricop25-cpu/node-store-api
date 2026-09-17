const db = require('../config/db');

// Convierte una fila de la tabla a la forma que ya espera el frontend
// (mismo shape que el catálogo local que reemplaza).
function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    category: row.category,
    price: row.price,
    oldPrice: row.compare_at_price,
    rating: Number(row.rating),
    reviews: row.reviews_count,
    stock: row.stock,
    freeShipping: row.price >= 100000,
    image: row.image_url,
    gallery: row.gallery_urls,
    description: row.description,
    bullets: row.bullets,
    active: row.active,
  };
}

async function list({ category, search, includeInactive = false } = {}) {
  const clauses = [];
  const params = [];

  if (!includeInactive) {
    clauses.push('active = true');
  }
  if (category) {
    params.push(category);
    clauses.push(`category = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`(lower(title) LIKE $${params.length} OR lower(brand) LIKE $${params.length} OR lower(category) LIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT * FROM products ${where} ORDER BY created_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  return rows[0] || null;
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function create(data) {
  const id = data.id || `${slugify(data.title)}-${Date.now().toString(36)}`;
  const { rows } = await db.query(
    `INSERT INTO products
      (id, slug, title, brand, category, price, compare_at_price, rating, reviews_count, stock, description, bullets, image_url, gallery_urls, active)
     VALUES ($1, $1, $2, $3, $4, $5, $6, COALESCE($7, 4.5), COALESCE($8, 0), $9, $10, $11, $12, $13, COALESCE($14, true))
     RETURNING *`,
    [
      id,
      data.title,
      data.brand || null,
      data.category,
      data.price,
      data.compareAtPrice || null,
      data.rating || null,
      data.reviewsCount || null,
      data.stock ?? 0,
      data.description || null,
      data.bullets || [],
      data.image || null,
      data.gallery || [],
      data.active,
    ]
  );
  return rows[0];
}

async function update(id, data) {
  const fields = [];
  const params = [];
  const map = {
    title: 'title',
    brand: 'brand',
    category: 'category',
    price: 'price',
    compareAtPrice: 'compare_at_price',
    rating: 'rating',
    reviewsCount: 'reviews_count',
    stock: 'stock',
    description: 'description',
    bullets: 'bullets',
    image: 'image_url',
    gallery: 'gallery_urls',
    active: 'active',
  };
  for (const [key, column] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      params.push(data[key]);
      fields.push(`${column} = $${params.length}`);
    }
  }
  if (!fields.length) return findById(id);

  params.push(id);
  const { rows } = await db.query(
    `UPDATE products SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0] || null;
}

// Resta stock sin condición de carrera: el UPDATE ... WHERE stock >= $qty
// hace la comprobación y el descuento en un solo paso atómico.
async function decrementStock(id, quantity) {
  const { rows } = await db.query(
    `UPDATE products SET stock = stock - $2, updated_at = now()
     WHERE id = $1 AND stock >= $2 RETURNING *`,
    [id, quantity]
  );
  return rows[0] || null;
}

async function remove(id) {
  // Borrado suave: si el producto ya tiene pedidos asociados, un DELETE duro
  // rompería el historial (order_items.product_id quedaría huérfano por el
  // ON DELETE SET NULL, perdiendo la referencia). Desactivar es más seguro.
  const { rows } = await db.query(
    `UPDATE products SET active = false, updated_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { toPublic, list, findById, create, update, remove, decrementStock };
