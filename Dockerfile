# syntax=docker/dockerfile:1.4
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4000

# Corre las migraciones pendientes (idempotente — ya llevan registro de
# cuáles se aplicaron) y luego arranca el servidor, así cada deploy queda
# al día con la base de datos sin un paso manual en la terminal de Coolify.
CMD ["sh", "-c", "node src/config/migrate.js && node src/index.js"]
