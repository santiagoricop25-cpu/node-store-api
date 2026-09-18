-- Promueve la cuenta del dueño de la tienda a administrador.
-- Si la cuenta todavía no existe (no se ha registrado en tienda.ricops.com),
-- este UPDATE simplemente no afecta ninguna fila y no falla.
UPDATE users
SET role = 'admin'
WHERE email = 'santiagoricop25@gmail.com';
