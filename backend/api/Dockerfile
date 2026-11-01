FROM node:20-alpine

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Generate Prisma Client during build
RUN npx prisma generate

EXPOSE 3000

# On start: regenerate the Prisma client (schema.prisma is bind-mounted in dev and may have changed),
# apply pending migrations (directly on the primary when MIGRATE_DATABASE_URL is set, because pgpool
# routes reads to the replica), then start NestJS in development (hot-reload) mode
CMD ["sh", "-c", "npx prisma generate && DATABASE_URL=\"${MIGRATE_DATABASE_URL:-$DATABASE_URL}\" npx prisma migrate deploy && npm run start:dev"]
