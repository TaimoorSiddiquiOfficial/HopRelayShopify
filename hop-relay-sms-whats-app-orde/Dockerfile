FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ARG DATABASE_URL=postgresql://user:password@localhost:5432/db
ENV DATABASE_URL=$DATABASE_URL

COPY package.json package-lock.json* ./

RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "docker-start"]
