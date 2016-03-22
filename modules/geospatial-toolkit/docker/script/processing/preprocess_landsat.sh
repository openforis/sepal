#!/bin/csh
#===========================================================================================================
#LandsatPreprocessV1.2.1.sh
#Contact: Erith Alexander Muñoz (erith7@gmail.com), FAO-Ecuador
#version: v.1.2.1
#
#Date:21/10/2015
#
#	Description:
#
#	This script is a generalization of the compositor_453_new_new.sh, developed by Erik Lindquist.
#	The task of this script is to implement a computational routine for preprocessing Landsat 8 images,
#	by completing the next steps:
#
#	1. Conversion to surface reflectance, and Atmospheric Correction.
#	2. Masking of clouds.
#	3. Generation of a composito for every path and row, from a temporal serie in a particular period of time, aimed to get a best pixels scene.
#
#	USE:
#	The variables pathRowDir, equations, LandsatOutput, and tmp, must be configured in order to
#	executing the script in a proper way. when this stage is covered, the next is the execution of the
#	code by writing ./LandsatPreprocess.sh in a unix terminal (a C shell work environment is required).
#
#============================================================================================================

if ($#argv != 3) then
    echo ""
    echo "Usage: preprocess_landsat.sh sourceDir outputDir tmpDir"
    echo ""
    echo "Arguments"
    echo "---------"
    echo "sourceDir   The directory with the landsat scenes for a path/row. Required directory name format: p[path]r[row]"
    echo "outputDir   The output directory"
    echo "tmpDir      The directory to use to store intermediate output"
    echo ""
    exit 1
endif

# Set up of Input Variables
set pathRowDir=$1  #Path to the path-row directory where the Landsat 8 data is located (with "/" at the end)
set equations=/usr/local/share/OFGTMethod #Path to the directory where the equations are located (without "/" at the end)
set outputDir=$2 #Path to the output directory (without "/" at the end)
set tmpDir=$3 #Path to a Temporal directory (not used)  (without "/" at the end)

# Create outputDir and tmpDir if missing
if (! -d $outputDir) mkdir -p $outputDir
if (! -d $tmpDir) mkdir -p tmpDir

# Getting in each path-row file
echo ""
echo "==============================================================="
echo " Processing Path-Row: "$pathRowDir
echo "==============================================================="

# Determine the Landsat scenes in every path-row file
cd $pathRowDir
set sceneList = `ls -1`
echo "Number of scenes in the Path-Row :" $#sceneList
echo ""

echo "==============================================================="
echo " Step 1 of 5: Corrections"
echo "==============================================================="
@ sceneNo = 1
foreach sceneName ($sceneList)
    echo "Converting to surface reflectance:" $sceneList[$sceneNo]" ("$sceneNo "of" $#sceneList "scenes)"
    cd $sceneName
    arcsi.py -s ls8 -f KEA --stats -p SREF CLOUDS --aeropro Continental --atmospro Tropical --aot 0.25 -o $outputDir -t $tmpDir -i $sceneName'_MTL.txt'
    cd ..
    @ sceneNo += 1
end

cd $outputDir

# TODO: Delete everything but *_sref.kea

set file1 = `ls -1 *_sref.kea`
foreach banda1 ($file1)
    echo $banda1
    set file2=`echo $banda1 | awk -F_ '{print $4"_"$2}'`
    gdal_translate -of "GTiff" $banda1 $file2'_tlate.tif'
    oft-calc $file2'_tlate.tif' $file2'_453.tif'<$equations'/'make_453.eq
end

rm $outputDir/*.kea # KEA files are not needed anymore

echo "==============================================================="
echo " Step 2 of 5: Mask"
echo "==============================================================="

set file3 = `ls -1 *_453.tif`
foreach banda2 ($file3)
    echo "Calculating good data mask for" $banda2
    set file4=`echo $banda2 | awk -F_ '{print $1"_"$2}'`
    oft-calc $banda2 $file4'_mask.tif'<$equations'/'make_mask.eq
end

echo "==============================================================="
echo " Step 3 of 5: Erode"
echo "==============================================================="

# Erode the good data mask to decrease the amount of cloud-affected pixels
set file1 = `ls -1 *_mask.tif`
foreach banda3 ($file1)
    echo "Eroding mask for" $banda3
    set file2=`echo $banda3 | awk -F_ '{print $1"_"$2}'`
    oft-erode -ws 5 $banda3 $file2'_erode.tif'
end

rm *_mask.tif # Mask is not needed anymore

echo "==============================================================="
echo " Step 4 of 5: NDVI"
echo "==============================================================="

set file1 = `ls -1 *_453.tif`
foreach banda4 ($file1)
    echo "Calculating NDVI for" $banda4
    set file2=`echo $banda4 | awk -F_ '{print $1"_"$2}'`
    oft-calc -ot Float32 -um $file2'_erode.tif' $banda4 $file2'_ndvi.tif'<$equations'/'make_ndvi.eq
end

echo "==============================================================="
echo " Step 5 of 5: Composite"
echo "==============================================================="

echo "Gdal_Merge Process .................."
set array=(*_ndvi.tif)
echo "Array of images:" $array
set image=$#array
echo "Number of Elements:" $image
@ images = `echo $image-1|bc`
echo "Difference:" $images
@ i=0
echo "Counter:" $i
echo "array:"$array

while ($i < $images)
    echo "Loop number:"$i

    if ($i == 0) then
        @ j= `echo $i+1|bc`
        @ jp= `echo $j+1|bc`
        echo gdal_merge.py --config GDAL_CACHEMAX 1000 -o 'merge_8bnd'$i'.tif' -separate $array[$j] $array[$jp]
        gdal_merge.py --config GDAL_CACHEMAX 1000 -o 'merge_8bnd'$i'.tif' -separate $array[$j] $array[$jp]
    else
        @ k= `echo $i-1|bc`
        @ j= `echo $i+1|bc`
        @ jp= `echo $j+1|bc`
        echo gdal_merge.py --config GDAL_CACHEMAX 1000 -o 'merge_8bnd'$i'.tif' -separate 'fillndvi2'$k'.tif' $array[$jp]
        gdal_merge.py --config GDAL_CACHEMAX 1000 -o 'merge_8bnd'$i'.tif' -separate 'fillndvi2'$k'.tif' $array[$jp]
    endif

    oft-calc -ot Float32 'merge_8bnd'$i'.tif' 'fillndvi'$i'.tif'<<EOF
3
#4 #8 > #5 #1 ?
#4 #8 > #6 #2 ?
#4 #8 > #7 #3 ?
EOF

    oft-calc 'fillndvi'$i'.tif'  'fillndvi'$i'.mask'<<EOF
1
#1 0 > 0 1 ?
EOF

    oft-calc -ot Float32 -um 'fillndvi'$i'.mask' 'fillndvi'$i'.tif' 'fillndvi2'$i'.tif'<<EOF
4
#1
#2
#3
#1 #3 - #1 #3 + /
EOF

    @ i += 1
end
exit
