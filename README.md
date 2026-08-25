# copaetec-backend

API REST del proyecto Copa ETec, extraída del monolito Next.js original (`pretch-app/copaetec`). Corre como un proyecto Next.js "API-only" (solo `app/api/*`, sin páginas) para poder desplegarse en Vercel de forma independiente del frontend.

El frontend correspondiente vive en [`copaetec-frontend`](https://github.com/pretch-app/copaetec-frontend) y consume esta API vía `fetch` con `credentials: "include"`.

## Requisitos

- Node 20+
- Una base de datos Postgres (Neon)
- Un Client ID/Secret de Google OAuth
- Un token de Vercel Blob (para subir escudos, fotos de galería e imágenes de noticias)

## Variables de entorno

Copiar `.env.example` a `.env.local` y completar:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a Neon Postgres |
| `JWT_SECRET` | Secreto para firmar la cookie de sesión (HMAC-SHA256, ver `lib/auth.ts`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciales OAuth de Google Cloud Console. El *redirect URI* autorizado debe ser `<URL_DEL_BACKEND>/api/auth/callback/google` |
| `ALLOWED_EMAIL_DOMAINS` | Dominios de email permitidos para registro/login (coma-separados) |
| `BLOB_READ_WRITE_TOKEN` | Token de Vercel Blob Storage |
| `FRONTEND_URL` | URL pública del frontend, usada para redirigir después del login con Google |
| `ALLOWED_ORIGINS` | Orígenes permitidos por CORS (coma-separados). Debe incluir la URL del frontend |

## Desarrollo local

```bash
npm install
npm run dev
```

Corre en `http://localhost:4000`. El frontend debe correr en un puerto distinto (por defecto `http://localhost:3000`) y apuntar `NEXT_PUBLIC_API_URL` a esta URL.

## Autenticación

Sesión basada en cookie httpOnly (`etec_session`, JWT firmado a mano) seteada por el backend. Como backend y frontend son orígenes distintos, todas las peticiones desde el frontend deben incluir `credentials: "include"`, y la cookie usa `SameSite=None; Secure` en producción (ver `lib/auth.ts`).

- `GET /api/auth/google` — redirige a Google para iniciar sesión (navegación directa del browser, no fetch)
- `GET /api/auth/callback/google` — callback de Google, crea/vincula el usuario y redirige a `FRONTEND_URL`
- `POST /api/auth/login` — `{ email, password }`
- `POST /api/auth/register` — `{ name, email, password, confirmPassword }`
- `POST /api/auth/logout`
- `GET /api/auth/me` — usuario actual (`{ user: User | null }`)

## Endpoints

### Públicos (sin login)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/teams` | Lista de equipos |
| GET | `/api/teams/slug/:slug` | Equipo por slug |
| GET | `/api/teams/:id/players` | Jugadores de un equipo |
| GET | `/api/teams/:id/matches` | Partidos de un equipo |
| GET | `/api/players` | Todos los jugadores |
| GET | `/api/matches` | Todos los partidos |
| GET | `/api/matches/finished` | Partidos finalizados |
| GET | `/api/matches/live` | Resultados en vivo (id, marcador, estado) |
| GET | `/api/matches/:id` | Un partido |
| GET | `/api/matches/:id/events` | Eventos de un partido |
| GET | `/api/events` | Todos los eventos |
| GET | `/api/gallery` | Galería de fotos |
| GET | `/api/standings` | Tabla de posiciones |
| GET | `/api/scorers?limit=10` | Goleadores |
| GET | `/api/stats` | Estadísticas del torneo |
| GET | `/api/settings` | Configuración del torneo |
| GET | `/api/news` | Noticias |
| GET | `/api/news/:id` | Una noticia |
| GET | `/api/predictions/upcoming` | Próximos partidos habilitados para predicción |
| GET | `/api/predictions/ranking?limit=100` | Ranking del prode |

### Requieren usuario logueado

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/predictions` | `{ match_id, predicted_home, predicted_away }` |
| GET | `/api/predictions/me` | Mis predicciones |
| GET | `/api/predictions/stats/me` | Mi posición y estadísticas en el ranking |

### Requieren rol admin

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/teams` | Crear equipo — JSON `{ name, captain?, grupo? }` |
| PATCH | `/api/teams/:id` | Editar equipo |
| DELETE | `/api/teams/:id` | Borrar equipo |
| POST | `/api/teams/:id/photo` | Subir foto — `multipart/form-data`, campo `photo` |
| POST | `/api/teams/:id/escudo` | Subir escudo — `multipart/form-data`, campo `escudo` |
| POST | `/api/players` | Crear jugador |
| DELETE | `/api/players/:id` | Borrar jugador |
| POST | `/api/matches` | Crear partido |
| PATCH | `/api/matches/:id` | Actualizar resultado/estado |
| DELETE | `/api/matches/:id` | Borrar partido |
| POST | `/api/matches/:id/events` | Agregar evento (gol, tarjeta, etc.) |
| PATCH | `/api/matches/:id/extras` | Penales / tiempo extra |
| DELETE | `/api/events/:id` | Borrar evento |
| POST | `/api/matches/generate-fixture` | Generar fixture de grupos |
| POST | `/api/matches/generate-bracket` | Generar llaves de eliminación |
| PATCH | `/api/settings` | Guardar configuración del torneo |
| POST | `/api/gallery` | Subir foto a galería — `multipart/form-data`, campo `photo` |
| DELETE | `/api/gallery/:id` | Borrar foto de galería |
| POST | `/api/news` | Crear noticia — `multipart/form-data`: `title, content, color, youtube_url, photo` |
| DELETE | `/api/news/:id` | Borrar noticia |
| GET | `/api/users` | Lista de usuarios |
| DELETE | `/api/users/:id` | Borrar usuario |

## Notas

- El *rate limiting* (`lib/rate-limit.ts`) es en memoria — en Vercel (serverless) cada instancia tiene su propio contador, así que es una protección básica, no estricta.
- `scripts/` y `scratch/` contienen utilidades puntuales de migración de datos que se ejecutan a mano contra `DATABASE_URL` (no forman parte del build de la API).
