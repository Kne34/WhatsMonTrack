FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# We don't necessarily need to expose a port for TCP microservices 
# in docker-compose, but we expose 3001 in case we add HTTP health checks.
EXPOSE 3001

CMD ["npm", "run", "start:dev"]
