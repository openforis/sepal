#!/usr/bin/env python3

import os

import re
import subprocess
from glob import glob
from os import listdir, pardir
from os.path import abspath, exists, join, relpath, basename
from osgeo import gdal
from osgeo.gdalconst import GA_ReadOnly
import xml.etree.cElementTree as ET
from xml.dom import minidom

# Keeps GDAL's error-return behaviour this script was written for; the sandbox runs it too.
gdal.DontUseExceptions()

# Drive inserts a hyphen before chip coordinates; Cloud Storage appends them directly.
tile_file_pattern = re.compile(r'.*(\d{10}-\d{10})\.tif$')
tile_dir_pattern = re.compile(r'.*-(\d{10}-\d{10})')
nodata_value = 0


def stack_time_series(directory, band=None, sits_dir=None):
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
    if band:
        create_sits_files(sits_dir or join(directory, 'sits'), tiles, band)
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
            'dates': dates,
            'tile_files': get_tile_files(chunk_dir)
        })
    return chunks


def get_tile_files(chunk_dir):
    tile_files = {}
    for tif_file in get_tif_files(chunk_dir):
        tile_files.setdefault(get_tile_name(tif_file), join(chunk_dir, tif_file))
    return tile_files


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
    tile_name = tile_dir_pattern.search(basename(tile_dir))[1]
    root = ET.Element('VRTDataset', {
        'rasterXSize': str(tile['xSize']),
        'rasterYSize': str(tile['ySize'])
    })
    ET.SubElement(root, 'SRS', {'dataAxisToSRSAxisMapping': '2,1'}).text = tile['projection']
    ET.SubElement(root, 'GeoTransform').text = tile['geoTransform']
    band_nr = 0
    for chunk in chunks:
        chunk_file = get_chunk_file(chunk, tile_name)
        for i, date in enumerate(chunk['dates']):
            band_nr = band_nr + 1
            band = ET.SubElement(root, 'VRTRasterBand', {
                'dataType': metadata['dataType'],
                'band': str(band_nr)
            })
            ET.SubElement(band, 'Description').text = date
            ET.SubElement(band, 'NoDataValue').text = str(nodata_value)
            source = ET.SubElement(band, 'ComplexSource')
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


def get_chunk_file(chunk, tile_name):
    chunk_file = chunk['tile_files'].get(tile_name)
    if not chunk_file:
        raise ValueError('{} has no file for tile {}; every chunk must be split into the same tiles'.format(
            basename(chunk['chunk_dir']), tile_name
        ))
    return chunk_file


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
    parent_dir = join(tif_file, pardir, pardir)
    return abspath(join(parent_dir, 'tile-' + get_tile_name(tif_file)))


def get_tile_name(tif_file):
    match = tile_file_pattern.match(tif_file)
    return match.group(1) if match else '0000000000-0000000000'


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


# One thin VRT per tile per date, named for a sits local_cube parse_info of c("X1", "tile", "band", "date").
# sits requires an upper-case band token for raw cubes. sits_dir may be shared by several bands, so they load
# as one multi-band cube.
def create_sits_files(sits_dir, tiles, band):
    create_tile_dir(sits_dir)
    band = band.replace('_', '-').upper()
    for tile in tiles:
        create_sits_tile_files(sits_dir, tile, band)


def create_sits_tile_files(sits_dir, tile, band):
    tile_dir = tile['tile_dir']
    tile_name = tile_dir_pattern.search(basename(tile_dir))[1]
    stack_file = join(tile_dir, 'stack.vrt')
    rel_stack_file = relpath(stack_file, sits_dir)
    ds = gdal.Open(stack_file, GA_ReadOnly)
    os.chdir(sits_dir)
    gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
    for band_index in range(1, ds.RasterCount + 1):
        date = ds.GetRasterBand(band_index).GetDescription()
        out_file = join(sits_dir, 'SEPAL_{}_{}_{}.vrt'.format(tile_name, band, date))
        vrt = gdal.BuildVRT(
            out_file, rel_stack_file,
            bandList=[band_index],
            VRTNodata=nodata_value
        )
        vrt.GetRasterBand(1).SetDescription(date)
        vrt.FlushCache()
        vrt = None
        # BuildVRT writes an absolute source path whatever it is given; keep it relative so the export can move.
        with open(out_file, 'r') as f:
            content = f.read()
        content = content.replace(stack_file, rel_stack_file).replace(
            'relativeToVRT="0"', 'relativeToVRT="1"'
        )
        with open(out_file, 'w') as f:
            f.write(content)
    ds = None


def make_relative_to_vrt(vrt_file):
    subprocess.check_call(['sed', '-i', 's/relativeToVRT="0"/relativeToVRT="1"/g', vrt_file])


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('directories', nargs='+')
    parser.add_argument('--band', help='Indicator name; also writes sits-readable per-date VRTs')
    parser.add_argument('--sits-dir', help='Where to write the sits VRTs (default: <directory>/sits)')
    args = parser.parse_args()

    for d in args.directories:
        if exists(d):
            print('Stacking time-series in {}'.format(d))
            stack_time_series(abspath(d), args.band, args.sits_dir)
        else:
            print('Not found: {}'.format(d))
