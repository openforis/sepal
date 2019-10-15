import csv
import logging
import os
import re
import subprocess
import uuid
from datetime import date
from functools import reduce
from glob import glob
from os import listdir, pardir
from os.path import abspath, isdir, join
from typing import Union

import ee
from osgeo import gdal
from rx import Observable, combine_latest, concat, defer, empty, from_callable, merge, of
from rx.operators import flat_map, map, scan
from sepal.drive.rx.path import create_folder_with_path, delete_file_with_path, download_path
from sepal.ee.dates import add_days, map_days, split_range_by_year, to_date, to_ee_date
from sepal.ee.image import set_precision
from sepal.ee.rx.export import export_image_to_drive, export_table_to_drive
from sepal.ee.rx.observables import execute
from sepal.ee.tile import tile
from sepal.format import format_bytes
from sepal.gdal import set_band_metadata
from sepal.rx.operators import merge_finalize
from sepal.task.rx.observables import progress

TILE_SIZE_IN_DEGREES = 1


def time_series_to_sepal(
        credentials,
        description: str,
        download_dir: str,
        image_collection_factory,
        start_date: Union[int, str, date],
        end_date: Union[int, str, date],
        region: Union[ee.Geometry, ee.Feature, ee.FeatureCollection],
        dimensions=None,
        scale: int = None,
        crs: str = None,
        crs_transform: str = None,
        max_pixels: Union[int, float] = None,
        shard_size: int = None,
        file_dimensions=None,
        skip_empty_tiles=None,
        file_format: str = None,
        format_options: str = None,
        precision: str = None,
        nodata_value: int = None,
        retries: int = 0
):
    start_date = to_date(start_date)
    end_date = to_date(end_date)
    year_ranges = split_range_by_year(start_date, end_date)
    drive_folder_path = '_'.join(['Sepal', description, str(uuid.uuid4())])

    def _create_drive_folder():
        return concat(
            progress(
                default_message='Creating Google Drive download folder...',
                message_key='tasks.retrieve.time_series_to_sepal.creating_drive_folder'
            ),
            create_folder_with_path(credentials, drive_folder_path).pipe(
                flat_map(lambda _: empty())
            )
        )

    def _export_geometries():
        def aggregate_progress(progresses, count):
            p = _sum_dicts(progresses.values(), excluded_keys=['geometry'])
            exported = round(100 * p['exported'] / count)
            downloaded = round(100 * p['downloaded'] / count)
            downloaded_bytes = format_bytes(p['downloaded_bytes'])
            processed = round(100 * p['processed'] / count)
            return progress(
                default_message='Exported {}%, Downloaded {}% ({}), Processed {}%'.format(
                    exported, downloaded, downloaded_bytes, processed
                ),
                message_key='tasks.retrieve.time_series_to_sepal.progress',
                exported=exported,
                downloaded=downloaded,
                downloaded_bytes=downloaded_bytes,
                processed=processed
            )

        features_collection = _to_features_collection(region)

        def export_geometry(geometry, i, geometry_count):
            geometry_description = str(i + 1).zfill(len(str(geometry_count)))
            return defer(
                lambda _: _export_geometry(
                    geometry,
                    geometry_description=geometry_description
                )
            )

        return concat(
            progress(
                default_message='Tiling AOI...',
                message_key='tasks.retrieve.time_series_to_sepal.tiling'
            ),
            _extract_feature_indexes(features_collection).pipe(
                flat_map(
                    lambda feature_indexes: _to_geometries(features_collection, feature_indexes).pipe(
                        flat_map(
                            lambda geometries: concat(
                                *[
                                    export_geometry(geometry, i, len(feature_indexes))
                                    for i, geometry in enumerate(geometries)
                                ]
                            )
                        ),
                        scan(lambda acc, p: {**acc, p['geometry']: p}, {}),
                        flat_map(lambda progresses: aggregate_progress(
                            progresses,
                            count=len(feature_indexes) * len(year_ranges)
                        ))
                    )
                )
            )
        )

    def _export_geometry(geometry, geometry_description):
        export_years = combine_latest(
            *[_export_year(
                geometry=geometry,
                year_start=year_range[0],
                year_end=year_range[1],
                export_description='{}_{}_{}'.format(geometry_description, year_range[0].year, description),
                year_dir='/'.join([download_dir, description, geometry_description, str(year_range[0].year)])
            ) for year_range in year_ranges]
        ).pipe(
            map(lambda progresses: _sum_dicts(progresses)),
            map(lambda p: {**p, 'geometry': geometry_description})
        )
        process_geometry = _process_geometry('/'.join([download_dir, description, geometry_description]))
        return concat(
            export_years,
            process_geometry
        )

    def _to_features_collection(r) -> ee.FeatureCollection:
        return tile(r, TILE_SIZE_IN_DEGREES)

    def _extract_feature_indexes(_feature_collection):
        def action():
            return _feature_collection.aggregate_array('system:index').getInfo()

        return execute(credentials, action, description='Feature indexes from FeatureCollection')

    def _to_geometries(_feature_collection, feature_indexes) -> Observable:
        def action():
            return [
                ee.Feature(
                    _feature_collection
                        .filterMetadata('system:index', 'equals', feature_index)
                        .first()
                ).geometry()
                for feature_index in feature_indexes
            ]

        return execute(credentials, action, description='FeatureCollection to geometries')

    def _export_year(geometry, year_start, year_end, export_description, year_dir):
        stack = _create_stack(geometry, year_start, year_end)
        if not stack.bandNames().size().getInfo():
            logging.info('No data between {} and {}'.format(year_start, year_end))
            return of({
                'exported': 1,
                'downloaded': 1,
                'downloaded_bytes': 0,
                'processed': 1
            })
        initial_progress = of({
            'exported': 0,
            'stack_bytes': 0,
            'dates_bytes': 0,
            'downloaded': 0,
            'processed': 0
        })

        def aggregate_downloaded_bytes(p):
            return {
                'exported': p['exported'],
                'downloaded': p['downloaded'],
                'downloaded_bytes': p['stack_bytes'] + p['dates_bytes'],
                'processed': p['processed']
            }

        return concat(
            initial_progress,
            merge(
                _export_and_download_stack(stack, export_description, year_dir),
                _export_and_download_dates(stack, export_description, year_dir)
            ),
            _process_year(year_dir),
            of({'processed': 1})
        ).pipe(
            scan(lambda acc, p: {**acc, **p}, {}),
            map(aggregate_downloaded_bytes)
        )

    def _create_stack(geometry, start, end):
        image_collection = image_collection_factory(geometry, start, end)

        def create_daily_mosaic(d):
            band_name = d.strftime('%Y-%m-%d')
            return image_collection \
                .filterDate(to_ee_date(d), to_ee_date(add_days(d, 1))) \
                .median() \
                .rename(band_name)

        daily_mosaics = map_days(start, end, create_daily_mosaic)
        stack = ee.Image(daily_mosaics).clip(geometry)
        return set_precision(stack, precision) if precision else stack

    def _export_and_download_stack(stack, export_description, year_dir):
        stack_drive_description = 'stack_' + export_description
        stack_drive_folder = '{}-{}'.format(stack_drive_description, str(uuid.uuid4()))
        stack_drive_path = '{}/{}'.format(drive_folder_path, stack_drive_folder)
        create_stack_drive_folder = create_folder_with_path(credentials, stack_drive_path).pipe(
            flat_map(lambda _: empty())
        )
        export_stack = _export_stack(stack, stack_drive_description, stack_drive_folder).pipe(
            flat_map(lambda _: empty())
        )
        download_stack_from_drive = _download_from_drive(
            path=stack_drive_path,
            destination=year_dir
        ).pipe(
            map(lambda p: {'stack_bytes': p.downloaded_bytes})
        )
        return concat(
            create_stack_drive_folder,
            export_stack,
            of({'exported': 1}),
            download_stack_from_drive,
            of({'downloaded': 1}),
        )

    def _export_stack(stack, drive_description, folder):
        return export_image_to_drive(
            credentials,
            stack,
            description=drive_description,
            folder=folder,
            dimensions=dimensions,
            scale=scale,
            crs=crs,
            crs_transform=crs_transform,
            max_pixels=max_pixels,
            shard_size=shard_size,
            file_dimensions=file_dimensions,
            skip_empty_tiles=skip_empty_tiles,
            file_format=file_format,
            format_options=format_options,
            retries=retries,
        )

    def _export_and_download_dates(stack, export_description, year_dir):
        table_drive_description = 'dates_' + export_description
        dates_drive_folder = '{}-{}'.format(table_drive_description, str(uuid.uuid4()))
        dates_drive_path = '{}/{}'.format(drive_folder_path, dates_drive_folder)
        create_dates_drive_folder = create_folder_with_path(credentials, dates_drive_path).pipe(
            flat_map(lambda _: empty())
        )
        export_dates = _export_dates(stack.bandNames(), table_drive_description, dates_drive_folder)
        download_dates_from_drive = _download_from_drive(
            path=dates_drive_path,
            destination=year_dir
        ).pipe(
            map(lambda p: {'dates_bytes': p.downloaded_bytes})
        )
        return concat(
            create_dates_drive_folder,
            export_dates,
            download_dates_from_drive
        )

    def _export_dates(dates, drive_description, folder):
        date_table = ee.FeatureCollection(
            dates.map(lambda d: ee.Feature(None, {'date': d}))
        )
        return export_table_to_drive(
            credentials,
            date_table,
            description=drive_description,
            folder=folder,
            file_format='CSV'
        ).pipe(
            flat_map(lambda _: empty())
        )

    def _download_from_drive(path, destination):
        return download_path(
            credentials,
            path=path,
            destination=destination,
            delete_after_download=True,
            retries=2
        )

    def _process_year(year_dir):
        def action():
            parent_dir = join(year_dir, pardir)
            tif_names = [f for f in listdir(year_dir) if f.endswith('.tif')]
            tile_pattern = re.compile('.*-(\d{10}-\d{10}).tif')
            for tif_name in tif_names:
                tile_name = tile_pattern.match(tif_name).group(1) \
                    if tile_pattern.match(tif_name) else '0000000000-0000000000'
                tile_dir = abspath(join(parent_dir, tile_name))
                subprocess.check_call(['mkdir', '-p', tile_dir])
                subprocess.check_call(
                    'mv {0} {1}'.format(abspath(join(year_dir, tif_name)), abspath(join(tile_dir, tif_name))),
                    shell=True)

            subprocess.check_call('mv {0} {1}'.format(join(year_dir, '*.csv'), parent_dir), shell=True)
            subprocess.check_call('rm -rf {0}'.format(year_dir).split(' '))

        return from_callable(action).pipe(
            flat_map(lambda _: empty())
        )

    def _process_geometry(geometry_dir):
        def action():
            dates = create_dates_csv()
            if dates:
                tiles_to_vrts(dates)

        def create_dates_csv():
            dates_path = join(geometry_dir, 'dates.csv')
            csv_paths = sorted(glob(join(geometry_dir, '*.csv')))
            if dates_path in csv_paths:
                csv_paths.remove(dates_path)
            if not csv_paths:
                return None
            with open(dates_path, 'w') as dates_file:
                for csv_path in csv_paths:
                    with open(csv_path, 'r') as csv_file:
                        for row in csv.DictReader(csv_file):
                            if row['date']:
                                dates_file.write(row['date'] + '\n')
                    subprocess.check_call('rm -rf {0}'.format(csv_path).split(' '))
                dates_file.flush()
                os.fsync(dates_file.fileno())
            return [d.rstrip('\n') for d in open(dates_path)]

        def tiles_to_vrts(dates):
            tile_dirs = sorted([d for d in glob(join(geometry_dir, '*')) if isdir(d)])
            for tile_dir in tile_dirs:
                tile_to_vrt(tile_dir)
            gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
            vrt = gdal.BuildVRT(
                geometry_dir + '/stack.vrt', sorted(glob(join(geometry_dir, '*.vrt'))),
                VRTNodata=nodata_value
            )
            if vrt:
                vrt.FlushCache()
            set_band_metadata('DATE', dates, [geometry_dir + '/*.vrt'])

        def tile_to_vrt(tile_dir):
            tif_paths = sorted(glob(join(tile_dir, '*.tif')))
            for tif_path in tif_paths:
                tif_file = gdal.Open(tif_path)
                tif_path_no_extension = os.path.splitext(tif_path)[0]
                if tif_file:
                    for band_index in range(1, tif_file.RasterCount + 1):
                        tif_vrt_path = '{0}_{1}.vrt'.format(tif_path_no_extension, str(band_index).zfill(10))
                        gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
                        vrt = gdal.BuildVRT(
                            tif_vrt_path, tif_path,
                            bandList=[band_index],
                            VRTNodata=nodata_value)
                        if vrt:
                            vrt.FlushCache()
            stack_vrt_path = tile_dir + '_stack.vrt'
            vrt_paths = sorted(glob(join(tile_dir, '*.vrt')))
            gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
            vrt = gdal.BuildVRT(
                stack_vrt_path, vrt_paths,
                separate=True,
                VRTNodata=0)
            if vrt:
                vrt.FlushCache()

        return from_callable(action).pipe(
            flat_map(lambda _: empty())
        )

    def _delete_drive_folder():
        return concat(
            progress(
                default_message='Deleting Google Drive download folder...',
                message_key='tasks.retrieve.time_series_to_sepal.deleting_drive_folder'
            ),
            delete_file_with_path(
                credentials,
                path=drive_folder_path
            ).pipe(
                flat_map(lambda _: empty())
            )
        )

    def _sum_dicts(dicts: list, excluded_keys: list = ()):
        keys = reduce(lambda acc, d: acc.union(set(d)), dicts, set())
        keys = [key for key in keys if key not in excluded_keys]
        return {key: sum([d.get(key, 0) for d in dicts]) for key in keys}

    return concat(
        _create_drive_folder(),
        _export_geometries(),
        _delete_drive_folder()
    ).pipe(
        merge_finalize(_delete_drive_folder)
    )
