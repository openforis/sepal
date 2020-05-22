#!/usr/bin/env python3

import os

import re
import subprocess
import sys
from glob import glob
from os import listdir, pardir
from os.path import abspath, join
from osgeo import gdal
from osgeo.gdalconst import GA_ReadOnly

tile_pattern = re.compile('.*-(\d{10}-\d{10}).tif')
nodata_value = 0


def stack_time_series(dir):
    chunk_dirs = glob(join(dir, 'chunk-*'))
    for chunk_dir in chunk_dirs:
        extract_chunk_bands(chunk_dir)
    tile_dirs = glob(join(dir, 'tile-*'))
    dates = None
    for tile_dir in tile_dirs:
        dates = create_tile_stack(tile_dir)
    create_stack(dir, dates)
    create_dates_csv(dir, dates)


def extract_chunk_bands(chunk_dir):
    tif_names = [
        tif_name
        for tif_name in listdir(chunk_dir)
        if tif_name.endswith('.tif')
    ]
    for tif_name in tif_names:
        extract_chunk_tile_bands(join(chunk_dir, tif_name))


def extract_chunk_tile_bands(tif_file):
    tile_dir = get_tile_dir(tif_file)
    create_tile_dir(tile_dir)
    ds = gdal.Open(tif_file, GA_ReadOnly)
    for band_index in range(1, ds.RasterCount + 1):
        band_name = ds.GetRasterBand(band_index).GetDescription()
        band_file = join(tile_dir, band_name + '.vrt')
        gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
        print('BAND INDEX {}'.format(band_index))
        vrt = gdal.BuildVRT(
            band_file, tif_file,
            bandList=[band_index],
            VRTNodata=nodata_value
        )
        vrt.GetRasterBand(1).SetDescription(band_name)
        vrt.FlushCache()


def get_tile_dir(tif_file):
    tile_name = tile_pattern.match(tif_file).group(1) \
        if tile_pattern.match(tif_file) \
        else '0000000000-0000000000'
    parent_dir = join(tif_file, pardir, pardir)
    return abspath(join(parent_dir, 'tile-' + tile_name))


def create_tile_dir(tile_dir):
    subprocess.check_call(['mkdir', '-p', tile_dir])


def create_tile_stack(tile_dir):
    vrt_files = [
        join(tile_dir, vrt_name)
        for vrt_name in sorted(listdir(tile_dir))
        if vrt_name.endswith('.vrt')
    ]
    stack_file = join(tile_dir, 'stack.vrt')
    gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
    vrt = gdal.BuildVRT(
        stack_file, vrt_files,
        separate=True,
        VRTNodata=nodata_value
    )
    dates = [
        os.path.splitext(os.path.basename(f))[0]
        for f in vrt_files
    ]
    for i, d in enumerate(dates):
        vrt.GetRasterBand(i + 1).SetDescription(d)
    vrt.FlushCache()
    return dates


def create_stack(dir, dates):
    tile_dirs = glob(join(dir, 'tile-*'))
    tile_stacks = [join(tile_dir, 'stack.vrt') for tile_dir in tile_dirs]
    stack_file = join(dir, 'stack.vrt')
    gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
    vrt = gdal.BuildVRT(
        stack_file, tile_stacks,
        VRTNodata=nodata_value
    )
    for i, d in enumerate(dates):
        vrt.GetRasterBand(i + 1).SetDescription(d)
    vrt.FlushCache()


def create_dates_csv(dir, dates):
    dates_file = join(dir, 'dates.csv')
    with open(dates_file, 'w') as f:
        for d in dates:
            f.write(d + '\n')


if __name__ == '__main__':
    dirs = sys.argv[1:]
    for d in dirs:
        stack_time_series(d)
