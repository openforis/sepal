#!/bin/bash
workingDir=$(readlink -f $1)
rm -rf $workingDir/input && mkdir -p $workingDir/input

# Assemble scenes in $workingDir into $workingDir/input/p${path}${row}
for scene in $workingDir/* ; do
    if [ -d "$scene" ]; then
        filename=$(basename "$scene")
        extension="${filename##*.}"
        sceneName="${filename%.*}"

        pathRegex='L..([0-9]{3}).*'
        [[ $sceneName =~ $pathRegex ]]
        path=${BASH_REMATCH[1]}

        rowRegex='L.....([0-9]{3}).*'
        [[ $sceneName =~ $rowRegex ]]
        row=${BASH_REMATCH[1]}

        if [ "$path" ] && [ "$path" ]; then
            pathRowDir="$workingDir/input/p${path}r${row}/"
            mkdir -p $pathRowDir
            mv $scene $pathRowDir
        fi
    fi
done

# Process the collection of scenes for each path/row
for pathRowDir in $workingDir/input/* ; do
    if [ -d "$pathRowDir" ]; then
        pathRowDirName=$(basename "$pathRowDir")
        resultDir=$workingDir/result-$pathRowDirName
        mkdir -p $resultDir
        tmpDir=$workingDir/tmp-$pathRowDirName
        mkdir -p $tmpDir
        echo preprocess_landsat.sh "${pathRowDir}/" $resultDir $tmpDir
        preprocess_landsat.sh "${pathRowDir}/" $resultDir $tmpDir
        mv $resultDir/* $workingDir
        rm -rf $pathRowDir
        rm -rf $resultDir
        rm -rf $tmpDir
    fi
done

rm -rf $workingDir/input
