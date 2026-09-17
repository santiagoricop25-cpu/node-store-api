const express = require('express');
const { z } = require('zod');

const products = require('../models/productModel');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

// GET /products?category=tecnologia&search=audifonos — catálogo público.
router.get('/products', async (req, res) => {
  const { category, search } = req.query;
  const rows = await products.list({ category, search });
  res.json({ products: rows.map(products.toPublic) });
});

// GET /products/:id
router.get('/products/:id', async (req, res) => {
  const row = await products.findById(req.params.id);
  if (!row || !row.active) return res.status(404).json({ error: 'not_found' });
  res.json({ product: products.toPublic(row) });
});

const productSchema = z.object({
  title: z.string().min(2),
  brand: z.string().optional(),
  category: z.string().min(1),
  price: z.number().int().nonnegative(),
  compareAtPrice: z.number().int().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  image: z.string().url().optional().or(z.literal('')),
  gallery: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

// A partir de aquí, todo requiere sesión de administrador.
router.use('/admin/products', requireAuth, requireAdmin);

// GET /admin/products — incluye inactivos, para poder reactivarlos.
router.get('/admin/products', async (req, res) => {
  const { category, search } = req.query;
  const rows = await products.list({ category, search, includeInactive: true });
  res.json({ products: rows.map(products.toPublic) });
});

// POST /admin/products
router.post('/admin/products', async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const created = await products.create(parsed.data);
  res.status(201).json({ product: products.toPublic(created) });
});

// PUT /admin/products/:id
router.put('/admin/products/:id', async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const updated = await products.update(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ product: products.toPublic(updated) });
});

// DELETE /admin/products/:id — desactiva (soft delete), no borra el historial.
router.delete('/admin/products/:id', async (req, res) => {
  const removed = await products.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not_found' });
  res.json({ product: products.toPublic(removed) });
});

module.exports = router;
