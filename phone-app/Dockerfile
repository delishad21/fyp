FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
EXPOSE 8081 19000 19001 19002
CMD ["npm", "run", "start", "--", "--host", "lan", "--port", "8081"]
