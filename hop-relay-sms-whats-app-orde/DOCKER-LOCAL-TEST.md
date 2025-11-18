# Docker Local Testing Guide

## Build and Run Locally with Docker

### 1. Create local .env file
Copy `.env.example` to `.env` and fill in values:

```env
SHOPIFY_API_KEY=2ba8e6117cba33bf73b057cb11b169db
SHOPIFY_API_SECRET=your_secret_here
SHOPIFY_APP_URL=http://localhost:3000
SCOPES=read_orders,read_customers
DATABASE_URL=postgresql://user:password@localhost:5432/hoprelay
HOPRELAY_SYSTEM_TOKEN=your_token_here
NODE_ENV=development
```

### 2. Start PostgreSQL with Docker
```powershell
docker run -d `
  --name hoprelay-postgres `
  -e POSTGRES_USER=hoprelay `
  -e POSTGRES_PASSWORD=hoprelay123 `
  -e POSTGRES_DB=hoprelay `
  -p 5432:5432 `
  postgres:16-alpine
```

### 3. Update DATABASE_URL in .env
```env
DATABASE_URL=postgresql://hoprelay:hoprelay123@host.docker.internal:5432/hoprelay
```

### 4. Build Docker Image
```powershell
cd "d:\HopRelay Shopify\hop-relay-sms-whats-app-orde"
docker build -t hoprelay-shopify-app .
```

### 5. Run Docker Container
```powershell
docker run -d `
  --name hoprelay-app `
  --env-file .env `
  -p 3000:3000 `
  hoprelay-shopify-app
```

### 6. View Logs
```powershell
docker logs -f hoprelay-app
```

### 7. Test the App
- Local: http://localhost:3000
- Use Shopify CLI tunnel for testing with Shopify

### 8. Stop and Clean Up
```powershell
docker stop hoprelay-app hoprelay-postgres
docker rm hoprelay-app hoprelay-postgres
```

## Docker Compose (Alternative - Easier)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - SHOPIFY_API_KEY=2ba8e6117cba33bf73b057cb11b169db
      - SHOPIFY_API_SECRET=${SHOPIFY_API_SECRET}
      - SHOPIFY_APP_URL=http://localhost:3000
      - SCOPES=read_orders,read_customers
      - DATABASE_URL=postgresql://hoprelay:hoprelay123@db:5432/hoprelay
      - HOPRELAY_SYSTEM_TOKEN=${HOPRELAY_SYSTEM_TOKEN}
      - HOPRELAY_ADMIN_BASE_URL=https://hoprelay.com/admin
      - HOPRELAY_API_BASE_URL=https://hoprelay.com/api
      - NODE_ENV=development
    depends_on:
      - db
    volumes:
      - .:/app
      - /app/node_modules

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=hoprelay
      - POSTGRES_PASSWORD=hoprelay123
      - POSTGRES_DB=hoprelay
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Then run:
```powershell
docker-compose up -d
docker-compose logs -f
```

Stop:
```powershell
docker-compose down
```
