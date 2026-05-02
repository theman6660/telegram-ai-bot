FROM node:20-slim

ENV TZ=Asia/Shanghai
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY bot.js ./
RUN mkdir -p memory

CMD ["node", "bot.js"]
