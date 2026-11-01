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

# Apply pending DB migrations, then start NestJS in development (hot-reload) mode
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:dev"]
