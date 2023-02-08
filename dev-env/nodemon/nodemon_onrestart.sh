#!/bin/sh

SHARED_DIR=$(basename $SHARED)
rsync -a $SHARED/src $MODULE/node_modules/$SHARED_DIR
