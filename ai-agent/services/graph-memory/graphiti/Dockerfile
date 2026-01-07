FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./server.js
COPY config.yaml ./config.yaml

ENV GRAPHITI_SERVER_PORT=8083
EXPOSE 8083

CMD ["node", "server.js"]
