# Use Node.js LTS
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Expose port
EXPOSE 8080

# Set environment variable for Cloud Run
ENV PORT=8080
ENV NODE_ENV=production

# Start the app
CMD ["node", "server.js"]
