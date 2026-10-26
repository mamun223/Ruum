# Tennis Prediction App

A sophisticated tennis prediction system using mathematical formulas, historical evidence, and environmental factors.

## Tech Stack

- **Web App**: Next.js 14, TypeScript, Tailwind CSS (Mobile-first PWA)
- **Backend**: Node.js/TypeScript with Express
- **Database**: PostgreSQL via Neon (free tier) with Prisma ORM
- **Background Workers**: Match importer, calculation worker, prediction worker, result updater

## Project Structure

```
tennis-prediction/
├── apps/
│   ├── web/              # Next.js mobile-first web app
│   └── backend/          # Express API server
├── packages/
│   ├── database/         # Database schema and utilities
│   ├── shared/           # Shared utilities and helpers
│   └── types/            # TypeScript type definitions
├── turbo.json            # Turborepo configuration
└── package.json          # Root package.json
```

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up Neon database:
   - Create free account at https://neon.tech
   - Create a new PostgreSQL project
   - Copy the connection string

3. Set up environment variables:

   ```bash
   cp packages/database/.env.example packages/database/.env
   # Add your Neon DATABASE_URL to packages/database/.env
   ```

4. Initialize database:

   ```bash
   cd packages/database
   npm run db:push
   npm run db:generate
   ```

5. Run development servers:
   ```bash
   npm run dev
   ```

## Build Order

1. Manual calculation engine
2. Name database
3. Upcoming match ingestion
4. Automatic calculations
5. Automatic result capture
6. Historical import
7. Exact-pair matching
8. Structural matching
9. Environmental matching
10. Prediction strength
11. Admin dashboard
12. Mobile app
13. Performance measurement
14. Weight calibration
