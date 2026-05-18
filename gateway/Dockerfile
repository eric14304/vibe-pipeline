FROM oven/bun:1.1.34-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN bun install --production --no-save

FROM oven/bun:1.1.34-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY types.ts ./
COPY index.ts ./
COPY lib ./lib
EXPOSE 8080
CMD ["bun", "run", "index.ts"]
