FROM oven/bun:1.4.0
WORKDIR /app
COPY gateway.mjs safe-read-retry.mjs cold-start-gate.mjs ./
COPY ui-repair.mjs ui-repair.css ./
ENV NODE_ENV=production
EXPOSE 10000
CMD ["bun", "run", "gateway.mjs"]
