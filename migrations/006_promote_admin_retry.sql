-- La migración 005 corrió antes de que la cuenta se registrara, así que no
-- promovió a nadie. Repetimos el ascenso a administrador ahora que la cuenta
-- ya existe. Si por algún motivo el correo no existe todavía, este UPDATE
-- simplemente no afecta ninguna fila y no falla.
UPDATE users
SET role = 'admin'
WHERE lower(email) = lower('santiagoricop25@gmail.com');
