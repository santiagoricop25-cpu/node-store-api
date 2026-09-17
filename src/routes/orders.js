const express = require('express');
const { z } = require('zod');
const jwt = require('jsonwebtoken');

const orders = require('../models/orderModel');
const products = require('../models/productModel');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

// El checkout funciona con o sin cuenta (compra como invitado). Si viene un
// Authorization: Bearer válido lo usamos para asociar la orden al usuario;
// si no viene, o es inválido/expiró, seguimos igual como invitado —
// a diferencia de requireAuth, esta ruta nunca debe devolver 401 por esto.
function attachUserIfPresent(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch {
      /* invitado */
    }
  }
  next();
}

const addressSchema = z.object({
  label: z.string().optional(),
  line: z.string().min(3),
  city: z.string().min(1).optional(),
  phone: z.string().min(5),
});

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        title: z.string(),
        image: z.string().optional(),
        price: z.number().int().nonnegative(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  shippingAddress: addressSchema,
  paymentMethod: z.enum(['contra_entrega', 'transferencia', 'tarjeta', 'wompi']).optional(),
  customer: z
    .object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

// POST /orders — crea la orden al terminar el checkout.
router.post('/orders', attachUserIfPresent, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const { items, shippingAddress, paymentMethod, customer, notes } = parsed.data;

  // Revalidamos precio y stock contra la base de datos — nunca confiamos en
  // lo que mande el navegador para el total a cobrar.
  const resolvedItems = [];
  for (const it of items) {
    const product = await products.findById(it.productId);
    if (!product || !product.active) {
      return res.status(400).json({ error: 'product_unavailable', productId: it.productId });
    }
    if (product.stock < it.quantity) {
      return res.status(400).json({ error: 'insufficient_stock', productId: it.productId, available: product.stock });
    }
    resolvedItems.push({
      productId: product.id,
      title: product.title,
      image: product.image_url,
      price: product.price,
      quantity: it.quantity,
    });
  }

  const order = await orders.create({
    userId: req.user?.sub || null,
    customer: {
      name: customer?.name || shippingAddress.label || null,
      email: customer?.email || req.user?.email || null,
      phone: customer?.phone || shippingAddress.phone,
    },
    items: resolvedItems,
    shippingAddress,
    paymentMethod,
    notes,
  });

  // Descontamos stock de forma atómica. Si alguien más se adelantó y ya no
  // alcanza, no revertimos la orden (ya se comprometió la venta) — el admin
  // la verá con nota implícita en el stock y puede resolverlo manualmente.
  for (const it of resolvedItems) {
    await products.decrementStock(it.productId, it.quantity).catch((err) => {
      console.error('[orders] no se pudo descontar stock de', it.productId, err.message);
    });
  }

  res.status(201).json({ order });
});

// GET /orders/me — pedidos del usuario logueado.
router.get('/orders/me', requireAuth, async (req, res) => {
  const rows = await orders.listForUser(req.user.sub);
  res.json({ orders: rows });
});

// GET /orders/:id — el dueño de la orden o un admin.
router.get('/orders/:id', attachUserIfPresent, async (req, res) => {
  const order = await orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (req.user?.role !== 'admin' && order.userId !== req.user?.sub) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json({ order });
});

// --- Panel de administración ---
router.use('/admin/orders', requireAuth, requireAdmin);

// GET /admin/orders?status=&paymentStatus=&search=&page=
router.get('/admin/orders', async (req, res) => {
  const { status, paymentStatus, search, page } = req.query;
  const result = await orders.listAll({
    status: status || undefined,
    paymentStatus: paymentStatus || undefined,
    search: search || undefined,
    page: page ? Number(page) : 1,
  });
  res.json(result);
});

const updateSchema = z.object({
  status: z.enum(['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado']).optional(),
  paymentStatus: z.enum(['pendiente', 'pagado', 'fallido', 'reembolsado']).optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
});

// PATCH /admin/orders/:id — cambiar estado, estado de pago, guía de envío...
router.patch('/admin/orders/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const updated = await orders.updateStatus(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ order: updated });
});

module.exports = router;
