FROM oven/bun:1.4.0
WORKDIR /app
COPY gateway.mjs ./gateway.mjs
ENV NODE_ENV=production
EXPOSE 10000
CMD ["bun", "run", "gateway.mjs"]
