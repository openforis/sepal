import csv
import logging
import os
import re
import subprocess
import uuid
from collections import namedtuple
from glob import glob
from os import listdir, pardir
from os.path import abspath
from os.path import isdir, join

import ee
import osgeo.gdal
from dateutil.parser import parse

from timeseries_stack import TimeSeries
from .. import drive
from ..drive import Download
from ..export.image_to_drive import ImageToDrive
from ..export.table_to_drive import TableToDrive
from ..task import Task

logger = logging.getLogger(__name__)

Status = namedtuple('Status', 'export_progress, download_progress, downloaded_bytes, pre_process_progress')
initial_status = Status(
    export_progress=0,
    download_progress=0,
    downloaded_bytes=0,
    pre_process_progress=0
)


class DownloadYear(Task):
    def __init__(self, spec, drive_folder, download_dir, description, feature_description):
        super(DownloadYear, self).__init__()
        self.spec = spec
        self.drive_folder = drive_folder
        self.description = description
        self.feature_description = feature_description
        self.year = parse(spec.from_date).year
        self.tableExport = None
        self.tableDownload = None
        self.imageExport = None
        self.imageDownload = None
        self.year_dir = '/'.join([download_dir, self.description, self.feature_description, str(self.year)])

    def run(self):
        logger.info('Exporting Earth Engine table to drive. {0}'.format(self.spec))
        ee.InitializeThread(self.spec.credentials)
        time_series = TimeSeries(self.spec)
        stack = time_series.stack
        dates = time_series.dates

        self.tableExport = TableToDrive(
            credentials=self.spec.credentials,
            table=dates,
            description='_'.join([self.description, self.feature_description, str(self.year), 'dates']),
            folder=self.drive_folder
        )
        self.tableDownload = Download(
            credentials=self.spec.credentials,
            drive_path=self.drive_folder,
            destination_path=self.year_dir,
            # ['/home', self.spec.username, 'downloads', self.description, self.feature_description, str(self.year)]),
            matching='{0}/{1}*.csv'.format(self.drive_folder, self.tableExport.description),
            move=True,
            touch=True
        )
        self.imageExport = ImageToDrive(
            credentials=self.spec.credentials,
            image=stack,
            region=self.spec.aoi,
            description='_'.join([self.description, self.feature_description, str(self.year), 'stack']),
            folder=self.drive_folder,
            scale=30,
            shardSize=256,
            fileDimensions=4096
        )
        self.imageDownload = Download(
            credentials=self.spec.credentials,
            drive_path=self.drive_folder,
            destination_path=self.year_dir,
            # ['/home', self.spec.username, 'downloads', self.description, self.feature_description, str(self.year)]),
            matching='{0}/{1}*.tif'.format(self.drive_folder, self.imageExport.description),
            move=True,
            touch=True
        )
        Task.submit_all([
            self.tableExport.submit()
                .then(self.tableDownload.submit, self.reject).catch(self.reject),
            self.imageExport.submit()
                .then(self.imageDownload.submit, self.reject).catch(self.reject)
        ]).then(self._preprocess_year, self.reject).catch(self.reject)

    def status(self):
        table_export_progress = 1 if self.tableExport and self.tableExport.resolved() else 0
        image_export_progress = 1 if self.imageExport and self.imageExport.resolved() else 0

        table_download_progress = 1 if self.tableDownload and self.tableDownload.resolved() else 0
        image_download_progress = 1 if self.imageDownload and self.imageDownload.resolved() else 0

        table_downloaded_bytes = self.tableDownload.status.downloaded_bytes if self.tableDownload else 0
        image_downloaded_bytes = self.imageDownload.status.downloaded_bytes if self.imageDownload else 0

        return Status(
            export_progress=table_export_progress * 0.01 + image_export_progress * 0.99,
            download_progress=table_download_progress * 0.01 + image_download_progress * 0.99,
            downloaded_bytes=table_downloaded_bytes + image_downloaded_bytes,
            pre_process_progress=1 if self.resolved() else 0
        )

    def close(self):
        Task.cancel_all([
            self.tableExport,
            self.tableDownload,
            self.imageExport,
            self.imageDownload
        ])

    def _preprocess_year(self, value):
        logger.debug('Pre-processing year {}'.format(self))
        parent_dir = join(self.year_dir, pardir)
        tif_names = [f for f in listdir(self.year_dir) if f.endswith('.tif')]
        tile_pattern = re.compile('.*-(\d{10}-\d{10}).tif')
        for tif_name in tif_names:
            tile = tile_pattern.match(tif_name).group(1) \
                if tile_pattern.match(tif_name) else '0000000000-0000000000'
            tile_dir = abspath(join(parent_dir, tile))
            subprocess.check_call(['mkdir', '-p', tile_dir])
            subprocess.check_call(
                'gdal_translate '
                '-co COMPRESS=NONE '
                '-co BIGTIFF=IF_NEEDED '
                '-a_nodata 0 '
                '{0} '
                '{1}'
                    .format(abspath(join(self.year_dir, tif_name)), abspath(join(tile_dir, tif_name))).split(' '))

        subprocess.check_call('mv {0} {1}'.format(join(self.year_dir, '*.csv'), parent_dir), shell=True)
        subprocess.check_call('rm -rf {0}'.format(self.year_dir).split(' '))

        print('Preprocessing year {0}'.format(self.year))
        return self.resolve()

    def __str__(self):
        return '{0}({1})'.format(type(self).__name__, self.spec)


class DownloadFeature(Task):
    def __init__(self, drive_folder, download_dir, description, feature_description, spec):
        super(DownloadFeature, self).__init__()
        self.drive_folder = drive_folder
        self.download_dir = download_dir
        self.feature_dir = '/'.join([download_dir, description, feature_description])
        self.description = description
        self.feature_description = feature_description
        self.spec = spec
        self.download_tasks = []

    def run(self):
        self.download_tasks = [
            DownloadYear(
                spec=self.spec._replace(from_date=from_date, to_date=to_date),
                drive_folder=self.drive_folder,
                download_dir=self.download_dir,
                description=self.description,
                feature_description=self.feature_description,
            )
            for from_date, to_date in self._yearly_ranges()
        ]

        return Task.submit_all(self.download_tasks) \
            .then(self._preprocess_feature, self.reject).catch(self.reject)

    def status(self):
        statuses = [task.status() for task in self.download_tasks]
        if not statuses:
            return initial_status
        return Status(
            export_progress=sum([s.export_progress for s in statuses]) / float(len(statuses)),
            download_progress=sum([s.download_progress for s in statuses]) / float(len(statuses)),
            downloaded_bytes=sum([s.downloaded_bytes for s in statuses]),
            pre_process_progress=sum([s.pre_process_progress for s in statuses]) / float(len(statuses))
        )

    def close(self):
        Task.cancel_all(self.download_tasks)

    def __str__(self):
        return '{0}({1})'.format(type(self).__name__, self.spec)

    def _preprocess_feature(self, value):
        logger.debug('Pre-processing feature {}'.format(self))
        self._create_dates_csv()
        self._tiles_to_vrts()
        return self.resolve()

    def _create_dates_csv(self):
        csv_paths = sorted(glob(join(self.feature_dir, '*.csv')))
        with open(join(self.feature_dir, 'dates.csv'), 'w') as dates_file:
            for csv_path in csv_paths:
                with open(csv_path, 'r') as csv_file:
                    for row in csv.DictReader(csv_file):
                        if row['date']:
                            dates_file.write(row['date'] + '\n')
                subprocess.check_call('rm -rf {0}'.format(csv_path).split(' '))
            dates_file.flush()

    def _tiles_to_vrts(self):
        tile_dirs = sorted([d for d in glob(join(self.feature_dir, '*')) if isdir(d)])
        for tile_dir in tile_dirs:
            self._tile_to_vrt(tile_dir)
        osgeo.gdal.BuildVRT(self.feature_dir + '/stack.vrt', sorted(glob(join(self.feature_dir, '*.vrt'))))

    def _tile_to_vrt(self, tile_dir):
        tif_paths = sorted(glob(join(tile_dir, '*.tif')))
        for tif_path in tif_paths:
            tif_file = osgeo.gdal.OpenShared(tif_path)
            tif_path_no_extension = os.path.splitext(tif_path)[0]
            if tif_file:
                for band_index in range(1, tif_file.RasterCount + 1):
                    tif_vrt_path = '{0}_{1}.vrt'.format(tif_path_no_extension, str(band_index).zfill(10))
                    osgeo.gdal.BuildVRT(tif_vrt_path, tif_path, bandList=[band_index])
        stack_vrt_path = tile_dir + '_stack.vrt'
        vrt_paths = sorted(glob(join(tile_dir, '*.vrt')))
        osgeo.gdal.BuildVRT(stack_vrt_path, vrt_paths, separate=True)

    def _yearly_ranges(self):
        from_date = parse(self.spec.from_date).date()
        to_date = parse(self.spec.to_date).date()
        ranges = []
        for year in range(from_date.year, to_date.year + 1):
            year_from = parse(str(year) + '-01-01').date() if year != from_date.year else from_date
            year_to = parse(str(year + 1) + '-01-01').date() if year != to_date.year else to_date
            if year_from != year_to:
                ranges.append((year_from.isoformat(), year_to.isoformat()))
        return ranges


class DownloadFeatures(Task):
    def __init__(
            self, download_dir, description, username, credentials, expression,
            data_sets, aoi, from_date, to_date, mask_snow, brdf_correct):
        super(DownloadFeatures, self).__init__('download_features')
        self.spec = TimeSeriesSpec(
            username, credentials, expression, data_sets, aoi, from_date, to_date,
            1, True, mask_snow, brdf_correct, 0)
        self.download_dir = download_dir
        self.description = description
        self.download_tasks = []
        self.drive_folder_name = '_'.join(['Sepal', self.description, str(uuid.uuid4())])
        self.drive_folder = None

    def run(self):
        # Explicitly create folder, to prevent GEE race-condition
        self.drive_folder = drive.create_folder(self.spec.credentials, self.drive_folder_name)
        if isinstance(self.spec.aoi, ee.FeatureCollection):
            aois = self.aoi.aggregate_array('system:index').getInfo() \
                .map(lambda aoiId: ee.Feature(table.filterMetadata('system:index', 'equals', aoiId).first()))
        else:
            aois = [self.spec.aoi]

        self.download_tasks = [
            DownloadFeature(
                drive_folder=self.drive_folder_name,
                download_dir=self.download_dir,
                description=self.description,
                feature_description=str(i + 1).zfill(len(str(len(aois)))),
                spec=self.spec._replace(aoi=aoi))
            for i, aoi in enumerate(aois)
        ]
        return Task.submit_all(self.download_tasks) \
            .then(self.resolve, self.reject)

    def status(self):
        statuses = [task.status() for task in self.download_tasks]
        if not statuses:
            return initial_status
        return Status(
            export_progress=sum([s.export_progress for s in statuses]) / len(statuses),
            download_progress=sum([s.download_progress for s in statuses]) / len(statuses),
            downloaded_bytes=sum([s.downloaded_bytes for s in statuses]),
            pre_process_progress=sum([s.pre_process_progress for s in statuses]) / len(statuses)
        )

    def close(self):
        Task.cancel_all(self.download_tasks)
        if self.drive_folder:
            drive.delete(self.spec.credentials, self.drive_folder)

    def __str__(self):
        return '{0}({1})'.format(type(self).__name__, self.spec)


TimeSeriesSpec = namedtuple(
    'TimeSeriesSpec',
    'username, credentials, expression, data_sets, aoi, from_date, to_date, shadow_tolerance, mask_clouds, mask_snow, brdf_correct, target_day')
