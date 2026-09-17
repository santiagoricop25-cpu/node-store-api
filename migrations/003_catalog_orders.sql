-- Fase 03/04: catálogo real, carrito → órdenes.

CREATE TABLE IF NOT EXISTS products (
  id                text PRIMARY KEY,      -- coincide con los ids que ya usaba el frontend (p1, p2, ...)
  slug              text UNIQUE NOT NULL,
  title             text NOT NULL,
  brand             text,
  category          text NOT NULL,
  price             integer NOT NULL CHECK (price >= 0),
  compare_at_price  integer CHECK (compare_at_price IS NULL OR compare_at_price >= price),
  rating            numeric(2,1) NOT NULL DEFAULT 4.5,
  reviews_count     integer NOT NULL DEFAULT 0,
  stock             integer NOT NULL DEFAULT 0,
  description       text,
  bullets           text[] NOT NULL DEFAULT '{}',
  image_url         text,
  gallery_urls      text[] NOT NULL DEFAULT '{}',
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);

CREATE TABLE IF NOT EXISTS orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      text UNIQUE NOT NULL DEFAULT ('NS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  guest_name        text,
  guest_email       text,
  guest_phone       text,
  status            text NOT NULL DEFAULT 'pendiente'
                      CHECK (status IN ('pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado')),
  payment_status    text NOT NULL DEFAULT 'pendiente'
                      CHECK (payment_status IN ('pendiente', 'pagado', 'fallido', 'reembolsado')),
  payment_method    text NOT NULL DEFAULT 'contra_entrega'
                      CHECK (payment_method IN ('contra_entrega', 'transferencia', 'tarjeta', 'wompi')),
  shipping_address  jsonb NOT NULL,
  subtotal          integer NOT NULL,
  tax               integer NOT NULL DEFAULT 0,
  shipping_cost     integer NOT NULL DEFAULT 0,
  total             integer NOT NULL,
  tracking_number   text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  text REFERENCES products(id) ON DELETE SET NULL,
  title       text NOT NULL,
  image_url   text,
  price       integer NOT NULL,
  quantity    integer NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
