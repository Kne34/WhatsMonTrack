FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Generate Prisma Client during build
RUN npx prisma generate

CMD ["npm", "run", "start:dev"]
