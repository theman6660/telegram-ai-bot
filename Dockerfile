FROM node:20-slim

ENV TZ=Asia/Shanghai
ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY bot.js ./
RUN mkdir -p memory

CMD ["node", "bot.js"]
