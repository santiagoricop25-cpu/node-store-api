require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const presenceRoutes = require('./routes/presence');

const app = express();
const PORT = process.env.PORT || 4000;

// Detrás de Cloudflare + Traefik/Coolify hay proxies delante de nosotros —
// esto hace que express-rate-limit y req.ip usen la IP real del cliente.
app.set('trust proxy', 1);

app.use(helmet());
app.use(morgan('tiny'));
app.use(express.json());
app.use(cookieParser());

// FRONTEND_ORIGIN admite una lista separada por comas (ej: "https://tienda.ricops.com,https://admin.ricops.com")
// para que varios frontends puedan hablar con esta misma API con cookies incluidas.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // llamadas sin origin (health checks, curl, etc.)
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // necesario para que la cookie del refresh token viaje al frontend
  })
);

// Límite general — se afina por ruta (login, checkout) en fases posteriores.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(healthRoutes);
app.use(authRoutes);
app.use(oauthRoutes);
app.use(productRoutes);
app.use(orderRoutes);
app.use(adminRoutes);
app.use(presenceRoutes);

// Pendiente: /webhooks/wompi (Fase 05, pagos en línea reales — requiere
// que abras tu propia cuenta comercial en Wompi; por ahora el checkout
// registra payment_method/payment_status y el admin los marca a mano).

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`[node-store-api] escuchando en el puerto ${PORT}`);
});
