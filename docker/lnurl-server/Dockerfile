FROM node:18-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ sqlite curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Create data directory
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
