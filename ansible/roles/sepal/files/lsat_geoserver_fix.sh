#!/bin/bash
# lsat_geoserver_fix.sh
fix() {
        source=$1;
        targetDir=$2;
    target="$targetDir/${source##*/}";
    tempDir=$(mktemp -d -p $targetDir);

        reproject $source $tempDir/reprojected.tif;
        adjustContrast $tempDir/reprojected.tif $tempDir/contrastAdjusted.tif;
        retile $tempDir/contrastAdjusted.tif $target;
        addOverview $target;
        rm -rf $tempDir;
}

reproject() {
        echo "Reprojecting $1 -> $2";
        gdalwarp -t_srs EPSG:3857 -srcnodata 0 -dstnodata 0 -multi $1 $2;
}

adjustContrast() {
        echo "Adjusting contrast $1 -> $2";
        stat=$tempDir/tmp.stat;
        oft-stat -i $1 -o $stat -mm -nostd -noavg;
        minb1="$(cat $stat | awk '{print $3}')";
        maxb1="$(cat $stat | awk '{print $6}')";
        minb2="$(cat $stat | awk '{print $4}')";
        maxb2="$(cat $stat | awk '{print $7}')";
        minb3="$(cat $stat | awk '{print $5}')";
        maxb3="$(cat $stat | awk '{print $8}')";

        gdal_translate -ot Byte -b 1 -scale $minb1 $maxb1 0 255 $1 $2\_b1.tif;
    gdal_translate -ot Byte -b 2 -scale $minb2 $maxb2 0 255 $1 $2\_b2.tif;
    gdal_translate -ot Byte -b 3 -scale $minb3 $maxb3 0 255 $1 $2\_b3.tif;

        oft-stack -o $2 $2\_b1.tif $2\_b2.tif $2\_b3.tif;
}


retile() {
        echo "Retiling $1 -> $2";
        gdal_translate -of GTiff -a_nodata 0 -co "TILED=YES" $1 $2;
}

addOverview() {
        echo "Adding overview -> $1";
        gdaladdo -r average $1 2 4 8 16;
}

fix $1 $2;