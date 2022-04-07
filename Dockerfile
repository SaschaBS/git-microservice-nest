FROM node:16 AS builder
WORKDIR /app
COPY ./package.json ./
RUN npm install
COPY . .
RUN npm run build


FROM node:16-alpine
WORKDIR /app
COPY --from=builder /app ./
RUN apk fix
RUN apk --update add git git-lfs less openssh && \
    git lfs install && \
    rm -rf /var/lib/apt/lists/* && \
    rm /var/cache/apk/*
CMD ["npm", "run", "start:prod"]