FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY doc ./doc 

RUN npm install --omit=dev

EXPOSE 3000

CMD ["npm", "start"]