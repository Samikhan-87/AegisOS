# Multi-stage build for frontend

# Stage 1: Build stage / Dev stage
FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Dev stage default command
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 2: Production build
FROM base AS build
RUN npm run build

# Stage 3: Serve with Nginx
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
