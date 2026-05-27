FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 4173
CMD ["npm", "run", "preview", "--", "--host", "--port", "4173"]
