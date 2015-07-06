#!/bin/bash
fix() {
	source=$1;
	targetDir=$2;
    target="$targetDir/${source##*/}";
    cp $source $target
}

fix $1 $2;
