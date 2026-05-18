<!-- Please save the logo you uploaded to the root of your project as 'logo.png' (or 'docs/logo.png') so the image tag below can render it! -->

<div align="center">
  <img src="./docs/inistntlogo.png" alt="Inistnt Logo" width="250" />

  <h1>🚀 Inistnt — The On-Demand Gig Economy Platform</h1>
  
  <p><strong>A hyper-scalable, full-stack monorepo for matching customers with verified service professionals in real-time.</strong></p>

  <!-- Shields/Badges -->
  <p>
    <img src="https://img.shields.io/badge/Monorepo-Turborepo-EF4444?style=for-the-badge&logo=turborepo" alt="Turborepo" />
    <img src="https://img.shields.io/badge/Backend-Fastify-000000?style=for-the-badge&logo=fastify" alt="Fastify" />
    <img src="https://img.shields.io/badge/Database-PostgreSQL_16-4169E1?style=for-the-badge&logo=postgresql" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/ORM-Prisma-2D3748?style=for-the-badge&logo=prisma" alt="Prisma" />
    <img src="https://img.shields.io/badge/Mobile-React_Native-61DAFB?style=for-the-badge&logo=react" alt="React Native" />
  </p>
</div>

---

## 📋 Table of Contents
1. [Platform Overview](#-platform-overview)
2. [Key Features](#-key-features)
3. [Monorepo Architecture](#-monorepo-architecture)
4. [System Architecture (C4 Model)](#-system-architecture-c4-model)
5. [Database Schema (ER Diagram)](#-database-schema-er-diagram)
6. [Core Business Flows](#-core-business-flows)
    - [Booking & Fulfillment Lifecycle](#a-booking--fulfillment-lifecycle)
    - [Financial Engine & TDS Payouts](#b-financial-engine--tds-payouts)
7. [Tech Stack Details](#-tech-stack-details)
8. [Local Development](#-local-development)

---

## 🌍 Platform Overview

**Inistnt** is an industry-grade platform designed to revolutionize the home and gig-services industry. By utilizing high-frequency geo-spatial matching, secure automated payments, and strict compliance monitoring (e.g., automated TDS deductions, identity verification), Inistnt provides a frictionless experience for both **Customers** (seeking services) and **Workers** (seeking earning opportunities).

---

## ✨ Key Features

| 🧑‍💼 For Customers | 🛠️ For Workers | 🛡️ For Administrators |
| :--- | :--- | :--- |
| **Instant & Scheduled Bookings** | **Live Job Radar** via Redis Geo-hashing | **Dynamic Surge Pricing** Control |
| **Real-time Tracking** of Worker ETA | **Automated Payouts** (Cashfree API) | **Commission Rule Engine** |
| **Secure OTP Verification** for job start | **Digital Wallets & Earnings Ledger** | **Fraud & Anomaly Detection** |
| **Seamless Payments** via Razorpay | **TDS Tax Compliance Automation** | **Worker Compliance Management** |
| **Multi-tier Service Catalogs** | **Loyalty & Reward Programs** | **Dispute & SOS Escalations** |

---

## 🏗️ Monorepo Architecture

The project is structured as a **Turborepo** to maximize code-sharing, ensure strict type safety across the stack, and accelerate build times.

```bash
inistnt/
├── apps/
│   ├── mobile-customer/  # React Native (Expo) app for end-users
│   ├── mobile-worker/    # React Native (Expo) app for gig workers
│   ├── web-customer/     # Next.js consumer web portal
│   ├── web-admin/        # Next.js CMS & operations dashboard
│   └── web-support/      # Internal portal for ticket/SOS resolution
├── services/
│   └── api/              # Core Fastify API (Business Logic, DB, Auth)
└── packages/
    ├── api-client/       # Shared Axios/tRPC client definitions
    ├── constants/        # Shared enums, configs, and mappings
    ├── types/            # Shared TypeScript interfaces
    ├── ui/               # Shared React UI components (Design System)
    └── validators/       # Zod schemas for cross-stack validation
```

---

## 🧩 System Architecture (C4 Model)

The following diagram represents the Container-level architecture of the Inistnt platform, showcasing how user-facing interfaces interact with backend services, databases, and external providers.

```mermaid
graph TD
    %% Styling
    classDef client fill:#0ea5e9,stroke:#0284c7,stroke-width:2px,color:#fff
    classDef backend fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff
    classDef db fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff
    classDef external fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff

    %% Components
    subgraph Clients ["Client Layer (Apps)"]
        CustomerApp[("📱 Customer App<br/>(React Native)")]:::client
        WorkerApp[("📱 Worker App<br/>(React Native)")]:::client
        AdminWeb[("💻 Admin Dashboard<br/>(Next.js)")]:::client
    end

    subgraph API_Gateway ["API Gateway & Compute Layer"]
        FastifyAPI["🚀 Core Fastify API<br/>(REST / WebSockets)"]:::backend
        BullMQWorker["⚙️ Background Workers<br/>(BullMQ)"]:::backend
    end

    subgraph Data_Layer ["State & Storage Layer"]
        Postgres[("🐘 PostgreSQL 16<br/>(Primary DB)")]:::db
        Redis[("⚡ Redis<br/>(Cache & Geo)")]:::db
        S3[("☁️ AWS S3<br/>(Media Storage)")]:::db
    end

    subgraph External ["External Third-Party APIs"]
        Razorpay["💳 Razorpay<br/>(Payment Collection)"]:::external
        Cashfree["💸 Cashfree<br/>(Worker Payouts)"]:::external
        FCM["🔔 Firebase FCM<br/>(Push Notifications)"]:::external
        SMS["📲 SMS Gateway<br/>(OTP & Comms)"]:::external
    end

    %% Routing
    CustomerApp <-->|HTTPS/WSS| FastifyAPI
    WorkerApp <-->|HTTPS/WSS| FastifyAPI
    AdminWeb <-->|HTTPS| FastifyAPI

    FastifyAPI <-->|Prisma TCP| Postgres
    FastifyAPI <-->|TCP| Redis
    FastifyAPI -- "Enqueue Jobs" --> BullMQWorker
    BullMQWorker <--> Postgres
    BullMQWorker <--> Redis

    FastifyAPI -->|Upload Docs| S3
    FastifyAPI -->|Collect Funds| Razorpay
    BullMQWorker -->|Disburse Funds| Cashfree
    FastifyAPI -->|Notify| FCM
    FastifyAPI -->|Send OTP| SMS
```

---

## 🗄️ Database Schema (ER Diagram)

The database is heavily normalized to ensure data integrity across complex financial and operational boundaries.

```mermaid
erDiagram
    %% Core Entities
    USER {
        String id PK
        String mobile UK
        String status
        Int walletBalance
    }
    
    WORKER {
        String id PK
        String status "PENDING, VERIFIED, ONLINE"
        String tier
        Int walletBalance
        String aadhaarNumber
    }

    CITY {
        String id PK
        String name
        Json surgeConfig
    }
    
    SERVICE {
        String id PK
        String name
        Int basePrice
    }

    BOOKING {
        String id PK
        String status
        String type "INSTANT / SCHEDULED"
        Int baseAmount
        Int finalAmount
        Int commissionAmount
        DateTime scheduledFor
    }

    PAYMENT {
        String id PK
        String status "CAPTURED, FAILED"
        Int amount
        String razorpayOrderId
    }

    WORKER_EARNING {
        String id PK
        Int grossAmount
        Int commission
        Int uniformDeduction
        Int netAmount
    }

    WORKER_PAYOUT {
        String id PK
        Int amount
        String status "PROCESSING, COMPLETED"
        String utrNumber
    }

    %% Relationships
    CITY ||--o{ WORKER : "operates in"
    CITY ||--o{ BOOKING : "location"
    
    USER ||--o{ BOOKING : "requests"
    WORKER ||--o{ BOOKING : "fulfills"
    SERVICE ||--o{ BOOKING : "is requested"
    
    BOOKING ||--|| PAYMENT : "secured by"
    BOOKING ||--|| WORKER_EARNING : "generates"
    
    WORKER ||--o{ WORKER_EARNING : "accumulates"
    WORKER ||--o{ WORKER_PAYOUT : "receives"
```

---

## 🔄 Core Business Flows

### A. Booking & Fulfillment Lifecycle
A highly resilient state machine tracks every gig from search to completion.

```mermaid
sequenceDiagram
    autonumber
    participant U as Customer
    participant API as Inistnt API
    participant R as Redis (Geo)
    participant W as Worker

    U->>API: 1. Request Service (lat, lng, serviceId)
    API->>API: 2. Calculate Pricing (Base + Surge)
    API->>R: 3. GEORADIUS Search (Find Active Workers)
    R-->>API: 4. Return Candidate Workers
    API->>W: 5. Broadcast Job via FCM (Push)
    W->>API: 6. Accept Job Request
    API->>U: 7. Confirm Booking (Share Worker ETA)
    
    Note over U, W: --- Fulfillment Phase ---
    W->>API: 8. Mark 'On The Way'
    W->>API: 9. Mark 'Arrived'
    API->>U: 10. Generate & Send OTP
    U->>W: 11. Share OTP offline
    W->>API: 12. Submit OTP to Start Work
    W->>API: 13. Mark Work 'Completed'
    
    Note over U, W: --- Settlement Phase ---
    API->>U: 14. Trigger Payment Request
    U->>API: 15. Pay via Razorpay (CAPTURED)
    API->>API: 16. Split Funds (Commission vs Earning)
    API->>W: 17. Credit Worker Wallet
```

### B. Financial Engine & TDS Payouts
Ensuring strict tax compliance and automated fund disbursement.

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker Wallet
    participant F as Finance Module
    participant DB as PostgreSQL
    participant C as Cashfree API

    F->>DB: 1. Fetch Approved Earnings for Worker
    DB-->>F: Pending Balance Data
    F->>F: 2. Calculate Annual Payout Aggregate
    
    alt Aggregate > ₹30,000 (Section 194C)
        F->>F: 3a. Deduct 1% TDS
        F->>DB: 3b. Log TDS Record against PAN
    else Below Threshold
        F->>F: 3c. Calculate 0% TDS
    end
    
    F->>DB: 4. Deduct Active Loan EMIs / Uniform Fees
    F->>DB: 5. Create WORKER_PAYOUT (Status: PROCESSING)
    F->>C: 6. Trigger Bank/UPI Transfer via Cashfree API
    
    C-->>F: 7. Acknowledge Transfer Initiated
    Note over F, C: Webhook Wait Period
    C->>F: 8. Webhook: Transfer SUCCESS (UTR Generated)
    F->>DB: 9. Update Payout Status -> COMPLETED
    F->>W: 10. Debit Worker Wallet Balance
```

---

## 🛠️ Tech Stack Details

| Domain | Technology | Purpose |
| :--- | :--- | :--- |
| **API Server** | Node.js + Fastify | High-throughput, low-latency REST & WebSocket server. |
| **Database ORM** | Prisma | Strongly typed database client and schema migrations. |
| **Primary DB** | PostgreSQL 16 | Relational data, ACID transactions, and robust constraints. |
| **Caching/State** | Redis (ioredis) | Session management, rate limiting, and fast Geo-spatial queries. |
| **Background Jobs** | BullMQ | Asynchronous tasks (webhook processing, bulk notifications). |
| **Monorepo Tools** | Turborepo, pnpm | Fast builds, dependency linking, and caching. |
| **Mobile Apps** | React Native + Expo | Cross-platform (iOS/Android) unified UI development. |
| **Web Apps** | React + Next.js | SEO-friendly consumer web and fast CMS dashboards. |

---

## 🚀 Local Development

Follow these steps to get the platform running on your local machine.

### Prerequisites
- Node.js (v20+)
- pnpm (v8+)
- Docker & Docker Compose (for Postgres and Redis)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/inistnt/inistnt.git
   cd inistnt
   ```

2. **Install Dependencies (from workspace root):**
   ```bash
   pnpm install
   ```

3. **Start Infrastructure (Databases):**
   ```bash
   # Starts PostgreSQL and Redis containers
   docker-compose up -d
   ```

4. **Environment Variables:**
   ```bash
   # Copy the example environments
   cp services/api/env.example services/api/.env
   # Ensure DATABASE_URL and REDIS_URL point to your local docker containers
   ```

5. **Database Setup:**
   ```bash
   cd services/api
   pnpm run db:generate
   pnpm run db:migrate
   pnpm run db:seed  # Optional: Loads dummy catalog & users
   ```

6. **Start the Development Servers:**
   ```bash
   # Go back to root and start Turborepo
   cd ../../
   pnpm dev
   ```
   *This command will spin up the Fastify API, Admin Web, and Mobile bundlers simultaneously.*

---

<div align="center">
  <p>Built with ❤️ by the <strong>Inistnt Engineering Team</strong>.</p>
</div>
