FROM node:22-alpine

WORKDIR /app
COPY jwt.js server.js token.js ./

USER node
EXPOSE 8080
CMD ["node", "server.js"]
