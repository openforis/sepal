#!/bin/bash
set -e

echo
echo "**************************"
echo "*** Installing Clojure ***"
echo "**************************"

bash < <(curl -s https://raw.githubusercontent.com/babashka/babashka/master/install)
curl -L -O https://github.com/clojure/brew-install/releases/latest/download/linux-install.sh
chmod +x linux-install.sh
./linux-install.sh
rm ./linux-install.sh
