#!/usr/bin/env python3

import os

import re
import subprocess
import sys
from glob import glob
from os import listdir, pardir
from os.path import abspath, exists, join, relpath, basename
from osgeo import gdal
from osgeo.gdalconst import GA_ReadOnly
import xml.etree.cElementTree as ET
from xml.dom import minidom

tile_file_pattern = re.compile('.*-(\d{10}-\d{10}).tif')
tile_dir_pattern = re.compile('.*-(\d{10}-\d{10})')
chunk_file_pattern = re.compile('chunk-(.*)')
nodata_value = 0


def stack_time_series(directory):
    chunk_dirs = sorted(glob(join(directory, 'chunk-*')))
    if not chunk_dirs:
        print('    Skipping. No chunk-* directories')
        return
    print('    Assembling tiles...', end='', flush=True)
    metadata = get_metadata(chunk_dirs)
    chunks = get_chunks(chunk_dirs)
    tiles = get_tiles(chunk_dirs)
    create_tile_stacks(metadata, chunks, tiles)
    dates = get_dates(chunks)
    create_stack(directory, dates)
    create_dates_csv(directory, dates)
    print('    Done.')


def get_metadata(chunk_dirs):
    chunk_dir = chunk_dirs[0]
    tif_file = get_tif_files(chunk_dir)[0]
    os.chdir(chunk_dir)
    rel_tif_file = relpath(tif_file, chunk_dir)
    ds = gdal.Open(rel_tif_file, GA_ReadOnly)
    return {
        'dataType': gdal.GetDataTypeName(ds.GetRasterBand(1).DataType)
    }


def get_chunks(chunk_dirs):
    chunks = []
    for chunk_dir in chunk_dirs:
        dates = []
        tif_file = get_tif_files(chunk_dir)[0]
        os.chdir(chunk_dir)
        rel_tif_file = relpath(tif_file, chunk_dir)
        ds = gdal.Open(rel_tif_file, GA_ReadOnly)
        for band_index in range(1, ds.RasterCount + 1):
            date = ds.GetRasterBand(band_index).GetDescription()
            dates.append(date)
        chunks.append({
            'chunk_dir': chunk_dir,
            'dates': dates
        })
    return chunks


def get_tiles(chunk_dirs):
    tiles = []
    chunk_dir = chunk_dirs[0]
    os.chdir(chunk_dir)
    for tif_file in get_tif_files(chunk_dir):
        rel_tif_file = relpath(tif_file, chunk_dir)
        ds = gdal.Open(rel_tif_file, GA_ReadOnly)
        band = ds.GetRasterBand(1)
        block_size = band.GetBlockSize()
        tiles.append({
            'projection': ds.GetProjection(),
            'geoTransform': ', '.join([str(i) for i in ds.GetGeoTransform()]),
            'tile_dir': get_tile_dir(tif_file),
            'xSize': ds.RasterXSize,
            'ySize': ds.RasterYSize,
            'xBlockSize': block_size[0],
            'yBlockSize': block_size[1]
        })
    return tiles


def create_tile_stacks(metadata, chunks, tiles):
    for tile in tiles:
        create_tile_stack(metadata, chunks, tile)


def create_tile_stack(metadata, chunks, tile):
    tile_dir = tile['tile_dir']
    root = ET.Element('VRTDataset', {
        'rasterXSize': str(tile['xSize']),
        'rasterYSize': str(tile['ySize'])
    })
    ET.SubElement(root, 'SRS', {'dataAxisToSRSAxisMapping': '2,1'}).text = tile['projection']
    ET.SubElement(root, 'GeoTransform').text = tile['geoTransform']
    band_nr = 0
    for chunk in chunks:
        for i, date in enumerate(chunk['dates']):
            band_nr = band_nr + 1
            band = ET.SubElement(root, 'VRTRasterBand', {
                'dataType': metadata['dataType'],
                'band': str(band_nr)
            })
            ET.SubElement(band, 'Description').text = date
            ET.SubElement(band, 'NoDataValue').text = str(nodata_value)
            source = ET.SubElement(band, 'ComplexSource')

            chunk_dir = chunk['chunk_dir']
            chunk_name = chunk_file_pattern.search(basename(chunk_dir))[1]
            tile_name = tile_dir_pattern.search(basename(tile_dir))[1]
            matches = sorted(glob(join(chunk_dir, '*{0}-{1}.tif'.format(chunk_name, tile_name))))
            if matches:
                chunk_file = matches[0]
            else:
                chunk_file = sorted(glob(join(chunk_dir, '*{}.tif'.format(chunk_name)))[0])
            ET.SubElement(source, 'SourceFilename', {
                'relativeToVRT': '1',
                'shared': '0'
            }).text = relpath(chunk_file, tile_dir)
            ET.SubElement(source, 'SourceBand').text = str(i + 1)
            ET.SubElement(source, 'SourceProperties', {
                'RasterXSize': str(tile['xSize']),
                'RasterYSize': str(tile['ySize']),
                'DataType': str(metadata['dataType']),
                'BlockXSize': str(tile['xBlockSize']),
                'BlockYSize': str(tile['yBlockSize'])
            })
            ET.SubElement(source, 'SrcRect', {
                'xOff': '0',
                'yOff': '0',
                'xSize': str(tile['xSize']),
                'ySize': str(tile['ySize'])
            })
            ET.SubElement(source, 'DstRect', {
                'xOff': '0',
                'yOff': '0',
                'xSize': str(tile['xSize']),
                'ySize': str(tile['ySize'])
            })
            ET.SubElement(source, 'NODATA').text = str(nodata_value)

    vrt = minidom.parseString(
        ET.tostring(root).decode("utf-8")
    ).toprettyxml(indent="  ").replace('&quot;', '"')
    stack_file = join(tile_dir, 'stack.vrt')
    create_tile_dir(tile_dir)
    with open(stack_file, 'w+') as text_file:
        text_file.write(vrt)


def get_dates(chunks):
    dates = []
    for chunk in chunks:
        dates.extend(chunk['dates'])
    return dates

def get_tif_files(directory):
    return [
        tif_name
        for tif_name in sorted(listdir(directory))
        if tif_name.endswith('.tif')
    ]


def extract_chunk_bands(chunk_dir):
    tif_names = [
        tif_name
        for tif_name in sorted(listdir(chunk_dir))
        if tif_name.endswith('.tif')
    ]
    for tif_name in tif_names:
        extract_chunk_tile_bands(join(chunk_dir, tif_name))


def extract_chunk_tile_bands(tif_file):
    tile_dir = get_tile_dir(tif_file)
    create_tile_dir(tile_dir)
    os.chdir(tile_dir)
    rel_tif_file = relpath(tif_file, tile_dir)
    ds = gdal.Open(rel_tif_file, GA_ReadOnly)
    for band_index in range(1, ds.RasterCount + 1):
        band_name = ds.GetRasterBand(band_index).GetDescription()
        band_file = join(tile_dir, band_name + '.vrt')

        gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
        vrt = gdal.BuildVRT(
            band_file, rel_tif_file,
            bandList=[band_index],
            VRTNodata=nodata_value
        )
        vrt.GetRasterBand(1).SetDescription(band_name)
        vrt.FlushCache()
        make_relative_to_vrt(band_file)
    print('.', end='', flush=True)


def get_tile_dir(tif_file):
    tile_name = tile_file_pattern.match(tif_file).group(1) \
        if tile_file_pattern.match(tif_file) \
        else '0000000000-0000000000'
    parent_dir = join(tif_file, pardir, pardir)
    return abspath(join(parent_dir, 'tile-' + tile_name))


def create_tile_dir(tile_dir):
    subprocess.check_call(['mkdir', '-p', tile_dir])


def create_stack(directory, dates):
    tile_dirs = sorted(glob(join(directory, 'tile-*')))
    tile_stacks = [join(tile_dir, 'stack.vrt') for tile_dir in tile_dirs]
    stack_file = join(directory, 'stack.vrt')
    gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
    vrt = gdal.BuildVRT(
        stack_file, tile_stacks,
        VRTNodata=nodata_value
    )
    for i, d in enumerate(dates):
        vrt.GetRasterBand(i + 1).SetDescription(d)
    vrt.FlushCache()


def create_dates_csv(directory, dates):
    dates_file = join(directory, 'dates.csv')
    with open(dates_file, 'w') as f:
        for d in dates:
            f.write(d + '\n')


def make_relative_to_vrt(vrt_file):
    subprocess.check_call(['sed', '-i', 's/relativeToVRT="0"/relativeToVRT="1"/g', vrt_file])


if __name__ == '__main__':
    dirs = sys.argv[1:]
    for d in dirs:
        if exists(d):
            print('Stacking time-series in {}'.format(d))
            stack_time_series(abspath(d))
        else:
            print('Not found: {}'.format(d))
