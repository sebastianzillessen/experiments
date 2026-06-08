FROM node:22-alpine
WORKDIR /app
COPY hoko-pi/puller/package.json ./
RUN npm install --omit=dev --no-audit --no-fund || true
COPY hoko-pi/puller/puller.mjs ./
CMD ["node", "puller.mjs"]
