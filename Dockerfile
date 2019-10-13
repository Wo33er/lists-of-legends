FROM node:9-alpine

EXPOSE 3001
WORKDIR /app
COPY . /app
CMD ["node", "app/app.js"]