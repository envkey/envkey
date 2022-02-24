#!/usr/bin/env bash

# Overrides: ENVKEY_SOURCE_BUCKET, ENVKEY_SOURCE_VERSION

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

# Set arch
if [[ "$(uname -m)" == 'x86_64' ]]; then
  ARCH="amd64"
elif [[ "$(uname -m)" == armv5* ]]; then
  ARCH="armv5"
elif [[ "$(uname -m)" == armv6* ]]; then
  ARCH="armv6"
elif [[ "$(uname -m)" == armv7* ]]; then
  ARCH="armv7"
elif [[ "$(uname -m)" == 'arm64' ]]; then
  ARCH="arm64"
else
  ARCH="386"
fi

if [[ "$(cat /proc/1/cgroup 2> /dev/null | grep docker | wc -l)" > 0 ]] || [ -f /.dockerenv ]; then
  IS_DOCKER=true
else
  IS_DOCKER=false
fi

# Set bucket
if [[ -z "${ENVKEY_SOURCE_BUCKET}" ]]; then
  BUCKET=envkey-releases
else
  BUCKET=$ENVKEY_SOURCE_BUCKET
  echo "Using custom bucket $BUCKET"
fi

# Set Version
if [[ -z "${ENVKEY_SOURCE_VERSION}" ]]; then  
  VERSION=$(curl -s "https://$BUCKET.s3.amazonaws.com/latest/envkeysource-version.txt")
else
  VERSION=$ENVKEY_SOURCE_VERSION
  echo "Using custom version $VERSION"
fi


welcome_envkey () {
  echo "envkey-source $VERSION Quick Install"
  echo "Copyright (c) 2022 Envkey Inc. - MIT License"
  echo ""
}

cleanup () {
  echo "Cleaning up..."
  cd $SCRIPT_DIR
  rm -rf envkey_source_install_tmp
}

download_envkey () {
  url="https://$BUCKET.s3.amazonaws.com/envkeysource/release_artifacts/${VERSION}/envkey-source_${VERSION}_${PLATFORM}_${ARCH}.tar.gz"

  mkdir envkey_source_install_tmp
  cd envkey_source_install_tmp

  echo "Downloading envkey-source tarball from $url"
  curl -s -L -o envkey-source.tar.gz "${url}"

  if [ -x "$(command -v minisign)" ]; then
    echo "minisign is installed--verifying artifact signature"
    curl -s -L -o envkey-source.tar.gz.minisig "${url}.minisig"
    { minisign -Vm envkey-source.tar.gz -P $MINISIGN_PUBKEY || { echo "Error: envkey-source.tar.gz signature invalid. Exiting with error." >&2; cleanup; exit 1; }; } && echo envkey-source.tar.gz verified
  else 
    echo "minisign is not installed--won't verify artifact signature"
  fi

  tar zxf envkey-source.tar.gz 1> /dev/null

  if [ "$PLATFORM" == "darwin" ] || $IS_DOCKER ; then
    if [[ -d /usr/local/bin ]]; then
      mv envkey-source /usr/local/bin/
      echo "envkey-source is installed in /usr/local/bin"
    else
      echo >&2 'Error: /usr/local/bin does not exist. Create this directory with appropriate permissions, then re-install.'
      cleanup
      exit 1
    fi
  elif [ "$PLATFORM" == "windows" ]; then
    # ensure $HOME/bin exists (it's in PATH but not present in default git-bash install)
    mkdir $HOME/bin 2> /dev/null
    mv envkey-source.exe $HOME/bin/
    echo "envkey-source is installed in $HOME/bin"
  else
    sudo mv envkey-source /usr/local/bin/
    echo "envkey-source is installed in /usr/local/bin"
  fi
}

welcome_envkey
download_envkey
cleanup

echo "Installation complete. Info:"
echo ""
envkey-source -h
