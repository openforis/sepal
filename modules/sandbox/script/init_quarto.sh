#!/bin/bash
set -e

echo
echo "**************************"
echo "*** Installing Quarto ***"
echo "**************************"

QUARTO_VERSION=1.7.17
wget "https://github.com/quarto-dev/quarto-cli/releases/download/v${QUARTO_VERSION}/quarto-${QUARTO_VERSION}-linux-amd64.deb"
dpkg -i "quarto-${QUARTO_VERSION}-linux-amd64.deb"
rm "quarto-${QUARTO_VERSION}-linux-amd64.deb"
