FROM node:20-slim

WORKDIR /app

# Copy package files from oracle-service
COPY packages/oracle-service/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY packages/oracle-service/ ./

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start the service
CMD ["npm", "start"]
