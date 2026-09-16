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

const app = express();
const PORT = process.env.PORT || 4000;

// Detrás de Cloudflare + Traefik/Coolify hay proxies delante de nosotros —
// esto hace que express-rate-limit y req.ip usen la IP real del cliente.
app.set('trust proxy', 1);

app.use(helmet());
app.use(morgan('tiny'));
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || '*',
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

// A partir de aquí se van montando: /products (Fase 03), /cart y /orders
// (Fase 04), /webhooks/wompi (Fase 05), /admin (Fase 06).

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
