FROM node:16-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN apk --no-cache add curl bash minisig

# Verify and install envkey-source
RUN VERSION=$(curl https://envkey-releases.s3.amazonaws.com/latest/envkeysource-version.txt) && ARTIFACT_URL=https://envkey-releases.s3.amazonaws.com/envkeysource/release_artifacts/$VERSION/install.sh && curl -O $ARTIFACT_URL -O $ARTIFACT_URL.minisig && { minisign -Vm install.sh -P "RWQ5lgVbbidOxaoIEsqZjbI6hHdS5Ri/SrDk9rNFFgiQZ4COuk6Li2HK" || { rm install.sh && install.sh.minisig &&  echo "Error: install.sh signature invalid. Exiting with error." >&2; exit 1; }; } && chmod +x install.sh && ./install.sh

EXPOSE 8081

CMD envkey-source -e 'node server.js'