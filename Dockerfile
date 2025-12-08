# Node app image with GDAL + zip for shapefile export
FROM node:20-bookworm

# Install GDAL (ogr2ogr) and zip
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     gdal-bin \
     zip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install deps first (better caching)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 4001

CMD ["npm","run","start"]

