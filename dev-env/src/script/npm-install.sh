#!/bin/bash

MODULE_PATH=$1
OPTIONS=$2

if [[ -f ${MODULE_PATH}/package.json ]]; then
    cd ${MODULE_PATH}
    npm install ${OPTIONS} --install-links=false && npm rebuild ${OPTIONS}
    # https://docs.npmjs.com/cli/v9/commands/npm-install#install-links
    # As per npm documentation, the default value for option --install-links is false, but it's not.
fi

exit $?
