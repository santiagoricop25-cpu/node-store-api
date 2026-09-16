# node-store-api

API backend de Node Store. Ver el plan completo (arquitectura, modelo de datos, fases) en el roadmap publicado.

## Desarrollo local

```bash
npm install
cp .env.example .env   # y edita DATABASE_URL apuntando a tu Postgres local
npm run migrate        # crea las tablas
npm run dev             # http://localhost:4000/health
```

## Despliegue en Coolify (Fase 00)

1. **Crear la base de datos**: en tu proyecto de Coolify, "New Resource" → PostgreSQL. Copia la cadena de conexión interna que te da (host = nombre del servicio, no una IP pública).
2. **Crear Redis**: igual, "New Resource" → Redis (Dragonfly también sirve).
3. **Conectar este repo**: "New Resource" → Public/Private Git Repository → pega la URL de `node-store-api` en GitHub.
4. **Build strategy**: `Dockerfile` (ya está en la raíz del repo).
5. **Variables de entorno**: copia todas las de `.env.example` a la pestaña "Environment Variables" de Coolify, con los valores reales (`DATABASE_URL` con la contraseña que Coolify generó para Postgres, secretos JWT generados con `openssl rand -hex 32`, etc).
6. **Domains**: `http://api.ricops.com`, Port `4000` (igual que `PORT` en las variables de entorno).
7. **Deploy**.
8. **Correr las migraciones una sola vez**: en Coolify, dentro del recurso ya desplegado, usa la opción de ejecutar un comando dentro del contenedor (Terminal / "Execute Command") y corre:
   ```
   npm run migrate
   ```
9. Verifica: `https://api.ricops.com/health` debe responder `{"status":"ok","db":"connected",...}`.

## Fase 01 — Endpoints de autenticación (correo + contraseña)

Después de desplegar los cambios de esta fase, corre de nuevo `npm run migrate` en el contenedor (agrega las tablas de tokens de verificación/recuperación).

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/auth/register` | `{ email, password, fullName }` → crea la cuenta, envía correo de verificación, deja la sesión iniciada |
| POST | `/auth/login` | `{ email, password }` → inicia sesión |
| POST | `/auth/refresh` | Usa la cookie del refresh token para dar un nuevo access token |
| POST | `/auth/logout` | Revoca la sesión actual |
| GET | `/auth/me` | Requiere `Authorization: Bearer <accessToken>` → datos del usuario logueado |
| GET | `/auth/verify-email?token=...` | Confirma el correo |
| POST | `/auth/forgot-password` | `{ email }` → envía el link para restablecer contraseña |
| POST | `/auth/reset-password` | `{ token, password }` → define la nueva contraseña |

**Cómo lo consume el frontend**: guarda el `accessToken` en memoria (una variable de estado, no localStorage) y llama `/auth/refresh` cuando expire (dura 15 minutos) — el refresh token vive en una cookie `httpOnly` que el navegador maneja solo, el JavaScript nunca la toca. Todas las peticiones al backend deben ir con `credentials: 'include'` para que esa cookie viaje.

Si quieres enviar los correos de verdad (en vez de verlos en los logs), agrega tus credenciales SMTP en las variables de entorno (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, etc.) — cualquier proveedor sirve (Brevo, Resend, Zoho, tu propio Postfix).
