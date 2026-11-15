FROM node:24-alpine

WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173

USER node
CMD ["node", "server.mjs"]
