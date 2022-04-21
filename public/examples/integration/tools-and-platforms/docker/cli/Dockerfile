FROM ubuntu

WORKDIR /workspace

# Install EnvKey CLI
RUN apt-get update && apt-get install -y curl

RUN LATEST_VERSION=$(curl https://envkey-releases.s3.amazonaws.com/latest/cli-version.txt) && curl -s https://envkey-releases.s3.amazonaws.com/cli/release_artifacts/$LATEST_VERSION/install.sh | bash

# Start app with latest environment 
CMD  envkey set another-app development DOCKER_CLI_VAR=$VAL && envkey set db-connection-checker development DOCKER_CLI_VAR=$VAL && envkey commit