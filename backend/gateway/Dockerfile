FROM node:20-alpine

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Generate Prisma Client (needed before the app starts)
RUN npx prisma generate

EXPOSE 3000

# Start the NestJS app in development (hot-reload) mode
CMD ["npm", "run", "start:dev"]
