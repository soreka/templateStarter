# Connevia – Project Structure & Status

## 1. High‑Level Architecture

- **Client (mobile)**
  - Expo React Native app in `connevia/`.
  - Uses **Auth0** via `expo-auth-session` for authentication.
  - Stores access tokens securely via `expo-secure-store`.
  - Talks to the backend via a shared `axios` instance configured with a base URL and `Authorization: Bearer <token>` header.

- **Server (API)**
  - Node/Express server in `connevia-server/`.
  - Uses **Auth0 access tokens** (JWT) validated via `jose` against Auth0 JWKS.
  - Uses **MongoDB (Mongoose)** for persistence (connection logic is wired; actual domain models not added yet).
  - Exposes a health endpoint and basic auth-protected example routes.

- **Environment & Config**
  - Client reads public config (API URL, Auth0 config) from Expo `extra` / env variables.
  - Server reads and validates env vars with Zod (`ENV` object) to ensure required values are present and correctly shaped.

---

## 2. Project Layout (Filesystem Overview)

- **Root (`connevia-app/`)**
  - `connevia/` – Expo React Native app (client).
  - `connevia-server/` – Express / Node API server.
  - `package.json`, `pnpm-lock.yaml`, `tailwind.config.js` – workspace tooling.

- **Client (`connevia/`)**
  - `App.tsx` – root React component registered by `index.ts`.
  - `index.ts` – calls `registerRootComponent(App)` (Expo entrypoint).
  - `app.json` – Expo project config (including `extra` env values).
  - `global.css` / `tailwind.config.js` – styling / NativeWind setup.
  - `src/`
    - `api.ts` – shared Axios client and token helpers.
    - `config.ts` – app-level configuration (reads env values for API base and Auth0).
    - `config/env.ts` – Expo-specific helper to read public env keys from `extra` and process env.
    - `auth/useAuth.ts` – custom React hook that drives Auth0 login/logout and token exchange.
    - `screens/`
      - `AuthTestScreen.tsx` – test screen to log in, call `/v1/me`, and log out.
      - `DebugEnv.tsx` – debug screen to introspect env and Expo `extra` values.
      - (other experimental screens as needed).
    - `rainy.tsx` – simple test component for UI / styling.

- **Server (`connevia-server/`)**
  - `src/index.ts` – main Express server bootstrap.
  - `src/env.ts` – env schema & validation (Zod) + computed `ENV` object.
  - `src/auth/jwt.ts` – Auth0 JWT validation + auth middlewares.
  - `src/routes/health.ts` – `/health` endpoint that reflects Mongo connection status.
  - `src/errors.ts` – HttpError class + global 404 & error handler.
  - `src/validate.ts` – generic Zod-based request validation middleware.
  - `src/logger.ts` – HTTP request logger middleware (used by server).
  - `src/types/` – placeholder for shared server-side types.

---

## 3. Core Flows & Component Responsibilities

### 3.1 Authentication Flow (Client side)

- **`useAuth` hook (`src/auth/useAuth.ts`)**
  - Manages local auth state: `accessToken`, `isLoading`, `error`.
  - Uses `AuthSession.useAutoDiscovery` to discover Auth0 OpenID configuration.
  - Computes a **redirect URI** via `AuthSession.makeRedirectUri({ scheme: CONFIG.auth0.scheme })`.
  - Creates an Auth request with `AuthSession.useAuthRequest` using:
    - `clientId`, `redirectUri`, standard OIDC scopes (`openid`, `profile`, `email`).
    - `extraParams.audience` to obtain an access token for the API.
  - Reacts to a successful auth response:
    - Exchanges authorization code for tokens using `AuthSession.exchangeCodeAsync`.
    - Extracts `accessToken` and stores it securely via `setAccessToken` (SecureStore).
    - Updates local state and exposes `accessToken` to the rest of the app.
  - Provides:
    - `login()` – opens Auth0 Universal Login in the system browser.
    - `logout()` – clears stored token and resets state.
    - `redirectUri` – for debugging / configuration checks.

- **`AuthTestScreen` (`src/screens/AuthTestScreen.tsx`)**
  - Uses `useAuth()` to show current auth state.
  - When logged out:
    - Shows a “Login with Auth0” button that triggers `login()`.
  - When logged in:
    - Shows status text (`Logged in ✅`).
    - Button to call `/v1/me` via the shared `api` client.
    - Button to `logout()`.
  - Uses alerts to show the `/v1/me` response payload for quick validation.

- **`api` client (`src/api.ts`)**
  - Exposes a singleton `axios` instance:
    - `baseURL` = `CONFIG.apiBase` (API root, e.g. `https://connevia.onrender.com`).
  - Attaches an interceptor to automatically add `Authorization: Bearer <token>` on each request if a token is stored.
  - Provides helper functions to `getAccessToken` / `setAccessToken` via `expo-secure-store`.

### 3.2 Environment & Config (Client side)

- **`src/config/env.ts`**
  - Merges Expo `extra` (from `app.json`) and EAS `Updates.manifest.extra`.
  - Exposes `ENV` object with strongly-typed keys:
    - `API_URL`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE`.
  - Throws clear errors when required keys are missing.

- **`src/config.ts`**
  - Provides a structured `CONFIG` object:
    - `apiBase` – base URL for the backend.
    - `auth0.domain`, `auth0.clientId`, `auth0.audience`, `auth0.scheme`.
  - Reads values from env / Expo config; central place to adjust public configuration.

- **`DebugEnv` screen**
  - Reads `Constants.expoConfig?.extra` and logs/prints all relevant public env keys.
  - Helps ensure that env setup matches what the app expects.

### 3.3 Server Boot & Middleware

- **`src/index.ts`**
  - Creates an Express app and sets `trust proxy` to support Render reverse proxy.
  - Applies middleware:
    - `helmet()` – basic security headers.
    - `express.json({ limit: '1mb' })` – JSON parsing.
    - `httpLogger` – request logging.
    - `cors()` – CORS with dynamic origin check based on `ENV.ALLOWED_ORIGINS`.
    - `rateLimit` – separate configurations for auth-related routes and write-heavy endpoints.
  - Sets up **Mongo** connection with Mongoose and logs connection lifecycle events.
  - Calls `await mongoose.connect(ENV.MONGO_URI)` *before* mounting routes that assume DB status.
  - Mounts routes:
    - `mountHealth(app)` – `/health` endpoint (reflects real Mongo status).
    - `/v1/me` – protected by `requireAuth`; returns decoded user info from the JWT.
    - `/v1/products` – example business-only route guarded by `requireAuth` + `requireRole('business')`.
    - `/` – basic API root message.
    - `/diag/version` – diagnostic endpoint exposing commit, Node version, etc.
  - Attaches `notFound` and `errorHandler` for consistent error responses.
  - Starts the HTTP server on `ENV.PORT`.

### 3.4 Auth & Authorization (Server side)

- **`src/auth/jwt.ts`**
  - Builds a remote JWKS reader from Auth0’s `.well-known/jwks.json`.
  - `requireAuth` middleware:
    - Reads Bearer token from `Authorization` header.
    - Verifies signature, issuer, audience, exp/nbf, with clock tolerance.
    - Extracts core identity and role from token payload using a custom claim namespace.
    - Attaches `req.user = { id, role, email }` and calls `next()`.
    - Returns uniform 401 errors for missing/invalid tokens.
  - `requireRole(...allowed)` middleware:
    - Ensures `req.user` exists and `user.role` is allowed.
    - Returns 401/403 with uniform error payload when unauthorized.

### 3.5 Health & Validation

- **`src/routes/health.ts`**
  - GET `/health`:
    - Reads Mongoose `connection.readyState`.
    - If not `1` (connected), returns 503 with `{ ok: false, error: ... }`.
    - If connected, returns `{ ok: true, db: 'up', mongoState: <readyState> }`, validated through a Zod schema.

- **`src/validate.ts`**
  - Generic middleware to validate `body`, `query`, and `params` using Zod.
  - Mutates the request with parsed (typed) data or forwards errors to the global handler.

- **`src/errors.ts`**
  - `HttpError` class with `status` + message.
  - `notFound` middleware to convert unmatched routes into a 404 `HttpError`.
  - `errorHandler` to normalize all errors into `{ ok: false, error: message }` and log server-side problems.

---

## 4. What’s Implemented So Far

- **Client**
  - Basic Expo + React Native + NativeWind setup is in place.
  - Auth0 integration via `useAuth` hook:
    - Discovery, PKCE, code exchange, token storage, and logout logic implemented.
  - API client with automatic token injection.
  - Test screens:
    - Auth flow test (`AuthTestScreen`) including calling `/v1/me`.
    - Environment debug screen (`DebugEnv`).
  - Env/config wrangling for public keys (`ENV` and `CONFIG`).

- **Server**
  - Env validation with Zod (`ENV` object) including Mongo and Auth0 configuration.
  - Express app with security middleware, rate limiting, CORS, and logging.
  - MongoDB connection setup with lifecycle logging.
  - `/health` endpoint wired to real Mongo connection status.
  - JWT-based authentication using Auth0 access tokens.
  - Role-based guard for example routes.
  - Uniform error handling structure.

---

## 5. What Still Needs To Be Done / Next Steps

### 5.1 Client Roadmap

- **Routing & Navigation**
  - Introduce a navigation solution (e.g. React Navigation) instead of manually toggling test screens.
  - Define a clear screen hierarchy:
    - Auth stack (login, callback/handling, onboarding).
    - Main app stack (home, messages, profiles, business dashboard, etc.).

- **Actual App Screens**
  - Replace `AuthTestScreen` and `rainy` with real UX flows:
    - Consumer-facing screens (browse, search, connect, etc.).
    - Business-facing screens (manage profile, offerings, etc.).
  - Shared layout & design system (buttons, typography, forms, etc.).

- **State Management & Data Fetching**
  - Decide on a pattern (React Query, Zustand, Redux, or lean React state) for server data.
  - Implement reusable hooks for `/v1/me`, business data, messaging, etc.

- **Error Handling & UX**
  - Global error and loading indicators (beyond per-screen spinners / alerts).
  - Graceful handling of expired tokens (re-prompt login, clear state).

- **Testing & Tooling**
  - Add basic tests (unit/integration) for `useAuth`, API wrapper, and critical screens.
  - Decide on formatting/linting rules and enforce across the app.

### 5.2 Server Roadmap

- **Domain Modeling**
  - Define Mongoose models for core concepts:
    - Users (or rely on Auth0 + derived profile).
    - Businesses.
    - Connections / messages / interactions.
  - Implement repository / service layer to avoid fat route handlers.

- **API Surface**
  - Flesh out real API routes under a versioned namespace (`/v1/...`) for:
    - Profiles & accounts.
    - Business creation & management.
    - Connections, messaging, or booking flows (depending on Connevia’s product direction).
  - Use `validate` + Zod schemas for each route’s payload.

- **Authorization Rules**
  - Clearly define what each role (`consumer`, `business`, `admin`) is allowed to do.
  - Apply `requireRole` consistently to routes and add tests for role-based access.

- **Observability & Operations**
  - Centralize logging format and correlation IDs (if needed).
  - Add more diagnostics endpoints or metrics if deploying to Render/other platforms.

- **Testing**
  - Add unit tests for `requireAuth`, `requireRole`, `env` parsing, and `health` route.
  - Add integration tests that spin up an in-memory Mongo and hit key routes.

---

## 6. Mental Model Summary ("What’s Going On So Far")

- You already have a **solid skeleton**:
  - Client knows how to talk to Auth0 and the API with a secure access token.
  - Server knows how to validate that token and identify the user + role.
  - Mongo connection and health checks are wired and reliable.
- The remaining work is mostly about:
  - Designing real domain models and endpoints on the server.
  - Designing real screens and flows on the client.
  - Wiring navigation, data fetching, and UX polish around the existing auth + health foundations.

This note can be extended as the project evolves: add new sections for specific features, data models, or decisions as you implement them.
