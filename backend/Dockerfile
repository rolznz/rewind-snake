FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY server.js database.js ./
RUN mkdir -p /data

CMD ["node", "server.js"]
