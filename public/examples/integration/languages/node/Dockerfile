FROM node:16-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE 8081

RUN apk --no-cache add curl bash

RUN curl -s https://raw.githubusercontent.com/envkey/envkey/master/public/sdks/envkey-source/install.sh | bash

CMD envkey-source -e 'node server.js' -w