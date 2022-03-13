FROM node:16-alpine

WORKDIR /usr/src/app

# Install envkey-source
RUN apk --no-cache add curl bash minisign

# Verify and install latest version (replace VERSION=... below to pin a version)
RUN VERSION=$(curl https://envkey-releases.s3.amazonaws.com/latest/envkeysource-version.txt) \
  && ARTIFACT_URL=https://envkey-releases.s3.amazonaws.com/envkeysource/release_artifacts/$VERSION/install.sh \
  && curl -O $ARTIFACT_URL -O $ARTIFACT_URL.minisig \
  && { minisign -Vm install.sh -P "RWQ5lgVbbidOxaoIEsqZjbI6hHdS5Ri/SrDk9rNFFgiQZ4COuk6Li2HK" || { echo "Error: install.sh signature invalid. Exiting with error." >&2 && exit 1; };  }\
  && chmod +x install.sh \
  && ./install.sh

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy files
COPY server.js server.js

# Expose port
EXPOSE 8081

# Start app with latest environment 
CMD envkey-source -- node server.js