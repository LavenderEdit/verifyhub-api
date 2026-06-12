# 🛡️ VerifyHub API — Centralized Multi-Tenant Verification Service

VerifyHub is a production-ready, highly secure, and multi-tenant self-hosted API designed to centralize the generation, delivery, and validation of verification codes (OTPs - One-Time Passwords) across multiple applications. It natively supports email dispatch via SMTP and WhatsApp automated messaging through `whatsapp-web.js` (Puppeteer/Chromium).

With VerifyHub, you don't need to rebuild authentication flow logic, SMTP configuration, or WhatsApp Web session registry for every new service or project. It isolates tenant configurations (workspaces, credentials, templates, and keys) at the database and application levels.

---

## 🚀 Tech Stack & Architecture

- **Framework**: [NestJS](https://nestjs.com/) (v11) with [Fastify](https://fastify.dev/) for high-throughput HTTP performance.
- **ORM & DB**: [Prisma](https://www.prisma.io/) (v6) with [PostgreSQL](https://www.postgresql.org/) (v18).
- **Caching & Queueing**: [Redis](https://redis.io/) (v8) as the distributed lock provider and state store, backed by [BullMQ](https://github.com/taskforcesh/bullmq) for asynchronous background message dispatch.
- **WhatsApp Web Integration**: [whatsapp-web.js](https://wwebjs.dev/) with automated Puppeteer/headless Chromium sessions.
- **Security**: AES-256-GCM encryption for stored SMTP credentials, SHA-256 with pepper hashing for API Keys, CORS, Helmet, rate limiting, and HMAC-SHA256 signatures for Webhook payloads.
- **CI/CD & Docker**: Multi-stage Docker build with system Chromium configuration, Docker Compose environment, and GitHub Actions workflow.

---

## 📁 Project Structure

```text
verifyhub-api/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI pipeline (lint, migrations, tests, docker check)
├── docs/
│   ├── deployment_guide.md      # Detailed environment setup and backup practices
│   └── integration_guide.md     # SDK initialization and HMAC validation examples
├── examples/
│   ├── nestjs-integration/      # Example external NestJS app consuming VerifyHub
│   └── springboot-integration/  # Example Spring Boot app consuming VerifyHub
├── prisma/
│   ├── migrations/              # PostgreSQL database migration scripts
│   ├── schema.prisma            # Prisma database model relationships
│   └── seed.ts                  # Database seeding script (optional)
├── sdk/
│   └── verifyhub-sdk.ts         # Lightweight TypeScript SDK wrapper for API clients
├── src/
│   ├── api-key/                 # API Key management, hashing, scopes, and Guard
│   ├── audit/                   # Audit logging database service, page filter, and CSV exporter
│   ├── auth/                    # Dashboard admin auth (JWT, refresh cookies, RolesGuard)
│   ├── challenge/               # OTP generator, validator, and public Verify Link controller
│   ├── common/                  # Configuration validation, filters, interceptors, Prisma/Redis services
│   ├── connector/               # Delivery channels integration
│   │   ├── smtp/                # SMTP Mail client creation and validation
│   │   └── whatsapp/            # whatsapp-web.js session manager, client registry, and lock
│   ├── dashboard/               # Metric aggregation and daily database maintenance job
│   ├── delivery/                # BullMQ message processors (delivery attempt tracker)
│   ├── health/                  # API Liveness/Readiness probes (Postgres & Redis health checks)
│   ├── template/                # Rich text and HTML engine with version control and rollback
│   ├── webhook/                 # Webhook registry, HMAC signatures, and BullMQ retry handler
│   ├── workspace/               # Workspace, Project, and Team member access control plane
│   ├── main.ts                  # Server bootstrap (Fastify configuration, cookie parser, filters)
│   └── app.module.ts            # Core dependency injection graph
├── test/
│   ├── app.e2e-spec.ts          # Core Fastify controller liveness test
│   └── verifyhub.e2e-spec.ts    # Comprehensive E2E integration test suite (26 cases)
├── tsconfig.json                # TypeScript compiler rules
├── Dockerfile                   # Multi-stage production Docker container
├── docker-compose.yml           # Local orchestrator for PostgreSQL and Redis
└── package.json                 # Project dependencies, metadata, and build scripts
```

---

## ⚙️ Step-by-Step Installation

Follow these steps to run VerifyHub API on your local machine or server.

### Prerequisites

Ensure you have the following installed:
1. **Node.js** (v20 or higher)
2. **pnpm** (preferred) or **npm**
3. **Docker** and **Docker Compose**
4. **PostgreSQL Client** (optional, for debugging)

---

### Step 1: Clone the Repository & Install Dependencies

Clone the codebase and run package installation:
```bash
git clone https://github.com/joanlavender/verifyhub-api.git
cd verifyhub-api
pnpm install
```

### Step 2: Configure Environment Variables

Copy the template configuration file:
```bash
cp .env.example .env
```
Open `.env` and configure your keys. For local development, the defaults are configured to match the `docker-compose.yml` services:
- **`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`**: Random hex strings (at least 32 characters) for signing JWT cookies.
- **`ENCRYPTION_MASTER_KEY`**: A secure string of 32-64 characters. VerifyHub hashes this key to derive a 256-bit AES key used to encrypt SMTP passwords.
- **`API_KEY_PEPPER`**: Random string used to salt API keys before hashing them to database.
- **`DATABASE_URL`**: DB connection string. Local default: `postgresql://verifyhub_user:verifyhub_password@localhost:5435/verifyhub_db?schema=public`
- **`REDIS_URL`**: Cache connection string. Local default: `redis://localhost:6375/0`

### Step 3: Spin Up Docker Services

Start the local PostgreSQL (port 5435) and Redis (port 6375) databases:
```bash
docker compose up -d
```
Verify the containers are running:
```bash
docker compose ps
```

### Step 4: Run Prisma Database Migrations

Generate the Prisma client and deploy the tables to the Postgres database:
```bash
npx prisma migrate dev
```
This command creates all tables defined in `prisma/schema.prisma` and applies the schema changes.

### Step 5: Start the API in Development Mode

Run the NestJS application with hot reloading enabled:
```bash
pnpm run start:dev
```
The server will boot up using Fastify and listen on `http://localhost:3000`. You can access the Swagger OpenAPI documentation interface at:
👉 **`http://localhost:3000/docs`**

---

## 🛠️ Step-by-Step Configuration & Flow Guide

Once your API is running, configure your workspace, connectors, and templates to start sending OTP codes.

### Flow Step 1: User Registration & Authentication (Control Plane)

The control plane is managed by human users. First, register a new administrator user on the dashboard:
1. **Register**: Send a `POST` request to `/v1/auth/register` with `email` and `password`.
2. **Login**: Send a `POST` request to `/v1/auth/login` with your credentials. The server returns user info and sets secure, HttpOnly, SameSite cookies containing the JWT access and refresh tokens.
3. Subsequent requests to the control plane are authenticated automatically via these cookies.

---

### Flow Step 2: Create a Workspace & Project

All configurations belong to a **Workspace** (representing a client, company, or tenant) and a **Project** (representing a specific application environment).
1. **Create Workspace**: Send `POST /v1/workspaces` with `name`. Note the returned `workspaceId`.
2. **Create Project**: Send `POST /v1/workspaces/:workspaceId/projects` with `name` and `allowedDomains` (e.g., `["mycompany.com"]`). Note the returned `projectId`.

---

### Flow Step 3: Generate an API Key (M2M authentication)

External systems interact with the `/v1/challenges` endpoint using Machine-to-Machine (M2M) API keys.
1. **Create API Key**: Send a `POST` request to `/v1/projects/:projectId/api-keys` with the query parameter `?workspaceId=:workspaceId`.
   * Body payload: `{ "name": "Production backend key", "scopes": ["challenge:write", "challenge:read"] }`
2. **Save the Key**: Save the returned plain text key (e.g., `vh_live_...`). This key is only shown once; only its SHA-256 hash is saved to the database.
3. Authenticate your client calls by passing the header `x-api-key: vh_live_...`.

---

### Flow Step 4: Add and Test Delivery Connectors

Connectors manage connection credentials for your delivery channels.

#### A. SMTP Mail Connector
1. **Create SMTP Connector**: Send a `POST` request to `/v1/connectors/smtp?workspaceId=:workspaceId`.
   * Body: `{ "host": "smtp.mailtrap.io", "port": 2525, "secure": false, "username": "my-user", "password": "my-password", "fromName": "VerifyHub Security", "fromEmail": "security@verifyhub.com" }`
   * The password is encrypted in the database using AES-256-GCM.
2. **Verify Connector**: Send `POST /v1/connectors/smtp/:id/test?workspaceId=:workspaceId`. Nodemailer checks credentials and writes success state (`testedAt`) or error code to database.

#### B. WhatsApp Web Connector (`whatsapp-web.js` + Puppeteer)
VerifyHub supports multiple concurrent WhatsApp sessions using headless Chromium.
1. **Create WhatsApp Session**: Send a `POST` request to `/v1/connectors/whatsapp?workspaceId=:workspaceId` with a nickname: `{ "name": "Support Phone" }`.
   * VerifyHub spins up an isolated Chromium profile in the background. It locks initialization using Redis (`lock:wwebjs:connector:<id>`) to prevent concurrency corruption.
2. **Get QR Code**: Poll `GET /v1/connectors/whatsapp/:id/status?workspaceId=:workspaceId`.
   * Once status is `QR_READY`, scan the returned base64 `qrCode` using your physical WhatsApp phone (Linked Devices).
3. **Connection State**: The status will update to `AUTHENTICATED`, and finally to `READY`. Your session credentials are saved under `wwebjs_sessions/` for auto-reconnection.
4. **Test Delivery**: Send a `POST` request to `/v1/connectors/whatsapp/:id/test-send?workspaceId=:workspaceId` with `to` (e.g. `+5491123456789`) and `message` to verify messaging is operational.

---

### Flow Step 5: Create templates

Verification messages require a template.
1. **Create Template**: Send `POST /v1/templates?workspaceId=:workspaceId`.
   * Body:
     ```json
     {
       "name": "login_otp",
       "type": "EMAIL",
       "subject": "Your Secure Verification Code",
       "bodyHtml": "<h3>Your code is: <strong>{{code}}</strong></h3>",
       "bodyText": "Your verification code is: {{code}}"
     }
     ```
2. **Version Control**: Every update to a template creates a new version (`TemplateVersion`).
3. **Rollback**: Roll back to a previous template layout by sending `POST /v1/templates/:templateId/rollback?workspaceId=:workspaceId` with `versionNumber`.

---

### Flow Step 6: Challenge OTP Generation & Verification (API Plane)

Once connectors and templates are ready, your external client apps can trigger and verify codes.

#### A. Generate Challenge (Request OTP)
Send a request from your external server backend using your API Key:
- **Endpoint**: `POST /v1/challenges`
- **Header**: `x-api-key: vh_live_...`
- **Payload**:
  ```json
  {
    "channel": "EMAIL",
    "purpose": "VERIFY_EMAIL",
    "destination": "user@example.com",
    "templateName": "login_otp",
    "locale": "es"
  }
  ```
- **Response**:
  ```json
  {
    "id": "challenge-uuid-here",
    "status": "QUEUED",
    "expiresAt": "2026-06-12T17:58:35.000Z",
    "signedUrl": "http://localhost:3000/v1/verify-link?token=..."
  }
  ```
  * Note: In `test` or `development` environment modes, the response also includes a `sandboxCode` field containing the raw OTP code for automated testing pipelines.
  * Behind the scenes, the challenge is queued inside BullMQ. The `DeliveryProcessor` fetches the job, fetches the required template, processes translations, and executes Nodemailer or whatsapp-web.js to dispatch the code.

#### B. Verify Code (Submit OTP)
When the user enters the code on your client frontend, submit it for validation:
- **Endpoint**: `POST /v1/challenges/:id/verify`
- **Header**: `x-api-key: vh_live_...`
- **Payload**: `{ "code": "123456" }`
- **Response**: `{ "verified": true, "message": "Challenge verified successfully." }`
  * The code is validated by comparing SHA-256 hashes.
  * If validation fails 5 times, the challenge is marked as `BLOCKED`.
  * If a user requests a code resend before 60 seconds have elapsed, VerifyHub rejects the request with a `429 Too Many Requests` (Anti-Flood Cooldown).

---

### Flow Step 7: Public Browser Verification (Verify Link)

When creating a challenge, the API returns a `signedUrl` (Verify Link).
1. The user clicks this link in their browser (or is redirected there).
2. The endpoint `/v1/verify-link?token=...` decrypts and verifies the signature and expiration timestamp.
3. If valid, it renders a modern, premium HTML/CSS dashboard page (supporting English `en` or Spanish `es` translations) displaying a stylized input form.
4. The user types the OTP, and visual micro-animations show the validation status. If correct, they are safely redirected back to the project's configured allowed domains.

---

### Flow Step 8: Webhook Integration

Configure Webhooks to notify your backend servers of verification updates.
1. **Register Webhook Endpoint**: Send `POST /v1/projects/:projectId/webhooks?workspaceId=:workspaceId`.
   * Body: `{ "url": "https://api.myclient.com/webhook-receiver", "events": ["challenge.sent", "challenge.verified"] }`
   * Returns a webhook `secret` (e.g. `whsec_...`).
2. **Receive Webhooks**: When events fire, VerifyHub sends a `POST` request to your URL.
3. **Verify HMAC Signature**: To ensure authenticity, compute the HMAC-SHA256 signature on the raw body payload prepended with the header timestamp:
   `signature = HMAC_SHA256(secret, header_timestamp + '.' + raw_body)`
   Compare this value to the received header `X-VerifyHub-Signature`.

---

## 🛡️ SaaS Features: Quotas, Auditing & Maintenance

VerifyHub is ready for multi-tenant deployment as a service:
1. **QuotaGuard**: Active NestJS Guard that checks hourly/daily usage metrics against configured project policies. It rejects requests when limits are exceeded or if abnormal abuse is detected.
2. **Audit Logs**: Every system action creates a log in PostgreSQL. Access logs using `GET /v1/audit-logs?workspaceId=:workspaceId` with filters for dates, actions, and projects. Export logs to CSV format via `GET /v1/audit-logs/export?workspaceId=:workspaceId`.
3. **Database Maintenance**: A daily cron job runs inside the `CleanupProcessor` to safely purge challenges and delivery logs older than 30 days, keeping the database optimized.

---

## 🧪 Running Tests

VerifyHub has a rigorous automated test suite covering all services, security guards, and channel mocks.

Run the end-to-end (E2E) integration test suite:
```bash
pnpm run test:e2e
```
*Note: Make sure your Redis and PostgreSQL Docker containers are running before starting the tests.*

To check codebase compliance with ESLint rules and automatic formatting:
```bash
pnpm run lint
pnpm run format
```

---

## 🐳 Production Deployment

For production deployments, utilize the multi-stage Docker build:
```dockerfile
# Builds production package, installs Chromium and font libraries for Puppeteer compatibility, 
# and runs under a non-root dedicated 'node' user for security containment.
```

Deploy using Docker:
```bash
docker build -t verifyhub-api .
docker run -d --name verifyhub -p 3000:3000 --env-file .env verifyhub-api
```
Ensure a persistent volume is mapped to `WWEBJS_SESSION_PATH` (e.g. `./wwebjs_sessions`) so WhatsApp sessions survive container restarts.

---

## 👥 Authors and Credits

This project was architected, developed, and tested under senior backend paradigms by:

**Juan Santos Pimentel Lalangui** (Alias: *Joan Lavender*)

---

## 📄 License

This project is licensed under the MIT License.
