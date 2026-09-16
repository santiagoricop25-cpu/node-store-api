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

## Fase 02 — Login social (Google y Apple)

Ambos siguen el mismo patrón: el navegador va directo al proveedor (`GET /auth/google` o `GET /auth/apple`), el proveedor redirige de vuelta a esta API con un `code`, la API lo cambia por un `id_token`, verifica su firma contra las llaves públicas del proveedor, crea o vincula el usuario, y finalmente redirige al frontend a `/oauth/callback?code=...` con un código de un solo uso (dura 60 segundos). El frontend debe tener una página en esa ruta que llame:

```
POST /auth/oauth/exchange   { "code": "..." }   → { accessToken, user }
```

igual que hace `/auth/login`, guardando el `accessToken` en memoria. El refresh token ya quedó en la cookie httpOnly desde el redirect.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/auth/google` | Redirige a la pantalla de consentimiento de Google |
| GET | `/auth/google/callback` | Recibe la vuelta de Google, crea sesión, redirige al frontend |
| GET | `/auth/apple` | Redirige a la pantalla de "Sign in with Apple" |
| POST | `/auth/apple/callback` | Apple contesta con POST (no GET) porque pedimos nombre y correo |
| POST | `/auth/oauth/exchange` | El frontend cambia el código de un solo uso por el `accessToken` |

### Configuración que solo tú puedes hacer (requiere tus propias cuentas)

**Google** — en [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
1. Crea un proyecto (o usa uno existente) → "Create Credentials" → "OAuth client ID" → tipo "Web application".
2. En "Authorized redirect URIs" agrega exactamente: `https://api.ricops.com/auth/google/callback`
3. Copia el "Client ID" y "Client secret" a las variables `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en Coolify.

**Apple** — en [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list) (requiere una cuenta de Apple Developer Program, que es de pago — esa parte la tienes que hacer tú, yo no puedo crear ni pagar cuentas en tu nombre):
1. Crea un "App ID" y luego un "Services ID" (este último es el `APPLE_SERVICES_ID`, con formato tipo `com.ricops.nodestore.web`).
2. En la configuración del Services ID, activa "Sign in with Apple", y en "Return URLs" agrega: `https://api.ricops.com/auth/apple/callback`
3. Crea una "Key" nueva con "Sign in with Apple" habilitado, descarga el archivo `.p8` (solo se puede descargar una vez) — su contenido completo (incluyendo `-----BEGIN PRIVATE KEY-----`) va en `APPLE_PRIVATE_KEY`.
4. El "Key ID" de esa llave va en `APPLE_KEY_ID`, y tu "Team ID" (arriba a la derecha del portal) va en `APPLE_TEAM_ID`.

Después de cargar esas 6 variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`) y `API_ORIGIN=https://api.ricops.com` en Coolify, solo falta redesplegar.
