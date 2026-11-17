FROM node:24.16.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY LICENSE THIRD-PARTY-NOTICES.md ./
COPY src ./src
COPY bin ./bin
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "/app/bin/code-quality.js"]
CMD ["serve", "/workspace", "--host", "0.0.0.0", "--port", "3000"]
