# Dockerfile
FROM node:9-alpine
# Or whatever Node version/image you want
COPY . .
WORKDIR '/var/www'