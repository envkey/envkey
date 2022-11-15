#!/usr/bin/env bash

# Overrides: ENVKEY_CLI_BUCKET and ENVKEY_CLI_VERSION

set -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

PLATFORM=
ARCH=
BUCKET=
VERSION=
MINISIGN_PUBKEY=RWQ5lgVbbidOxaoIEsqZjbI6hHdS5Ri/SrDk9rNFFgiQZ4COuk6Li2HK

# Set platform
case "$(uname -s)" in
 Darwin)
   PLATFORM='darwin'
   ;;

 Linux)
   PLATFORM='linux'
   ;;

 FreeBSD)
   PLATFORM='freebsd'
   ;;

 CYGWIN*|MINGW*|MSYS*)
   PLATFORM='windows'
   ;;

 *)
   echo "Platform may or may not be supported. Will attempt to install."
   PLATFORM='linux'
   ;;
esac

# Set architecture
if [[ "$(uname -m)" == 'x86_64' ]]; then
  ARCH="amd64"
elif [[ "$(uname -m)" == armv5* ]]; then
  ARCH="armv5"
elif [[ "$(uname -m)" == armv6* ]]; then
  ARCH="armv6"
elif [[ "$(uname -m)" == armv7* ]]; then
  ARCH="armv7"
elif [[ "$(uname -m)" == 'arm64' || "$(uname -m)" == 'aarch64' ]]; then
  ARCH="arm64"
else
  ARCH="386"
fi

if [[ "$(cat /proc/1/cgroup 2> /dev/null | grep docker | wc -l)" > 0 ]] || [ -f /.dockerenv ]; then
  IS_DOCKER=true
else
  IS_DOCKER=false
fi

# Set Bucket
if [[ -z "${ENVKEY_CLI_BUCKET}" ]]; then
  BUCKET=envkey-releases
else
  BUCKET=$ENVKEY_CLI_BUCKET
  echo "Using custom bucket $BUCKET"
fi

# Set Version
if [[ -z "${ENVKEY_CLI_VERSION}" ]]; then  
  VERSION=$(curl -s "https://$BUCKET.s3.amazonaws.com/latest/cli-version.txt")
else
  VERSION=$ENVKEY_CLI_VERSION
  echo "Using custom version $VERSION"
fi

welcome_envkey () {
  echo "envkey CLI $VERSION Quick Install"
  echo "Copyright (c) 2022 Envkey Inc. - MIT License"
  echo ""
}

cleanup () {  
  echo "Cleaning up..."
  cd "$SCRIPT_DIR"
  rm -rf envkey_cli_install_tmp
}

download_envkey () {
  echo "Downloading EnvKey CLI binary for ${PLATFORM}-${ARCH}"
  url="https://$BUCKET.s3.amazonaws.com/cli/release_artifacts/$VERSION/envkey-cli_${VERSION}_${PLATFORM}_${ARCH}.tar.gz" 

  mkdir envkey_cli_install_tmp
  cd envkey_cli_install_tmp

  echo "Downloading CLI tarball from ${url}"
  curl -s -L -o envkey-cli.tar.gz "${url}"

  if [ -x "$(command -v minisign)" ]; then
    echo "minisign is installed--verifying artifact signature"
    curl -s -L -o envkey-cli.tar.gz.minisig "${url}.minisig"
    { minisign -Vm envkey-cli.tar.gz -P $MINISIGN_PUBKEY || { echo "Error: envkey-cli.tar.gz signature invalid. Exiting with error." >&2; cleanup; exit 1; }; } && echo envkey-cli.tar.gz verified
  else 
    echo "minisign is not installed--won't verify artifact signature"
  fi

  tar xzf envkey-cli.tar.gz 1> /dev/null

  if [ "$PLATFORM" == "darwin" ] || $IS_DOCKER ; then
    if [[ -d /usr/local/bin ]]; then
      mv -f ./envkey /usr/local/bin/
      { mv -f ./envkey-keytar.node /usr/local/bin/ 2> /dev/null; } || true;
      echo "EnvKey CLI is installed in /usr/local/bin"
    else
      echo >&2 'Error: /usr/local/bin does not exist. Create this directory with appropriate permissions, then re-install.'
      cleanup
      exit 1
    fi
  elif [ "$PLATFORM" == "windows" ]; then
    # ensure $HOME/bin exists (it's in PATH but not present in default git-bash install)
    mkdir "$HOME/bin" 2> /dev/null
    mv ./envkey.exe "$HOME/bin/"
    mv ./envkey-keytar.node "$HOME/bin/"
    echo "EnvKey CLI is installed in '$HOME/bin'"
  else
    CAN_I_RUN_SUDO=$(sudo -n uptime 2>&1|grep "load"|wc -l)
    if [ "${CAN_I_RUN_SUDO}" -gt 0 ]; then
      sudo mv ./envkey /usr/local/bin/
      { sudo mv ./envkey-keytar.node /usr/local/bin/ 2> /dev/null; } || true;
    else
      mv ./envkey /usr/local/bin/
      { mv ./envkey/envkey-keytar.node /usr/local/bin/ 2> /dev/null; } || true;
    fi
    echo "EnvKey CLI is installed in /usr/local/bin"
  fi
}

welcome_envkey
download_envkey
cleanup

echo "stat /usr/local/bin/envkey"
stat /usr/local/bin/envkey

echo "which envkey"
which envkey

echo "Installation complete. Info:"
envkey -h
