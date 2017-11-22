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

from timeseries import TimeSeries
from .. import drive
from ..drive import Download
from ..export.image_to_drive import ImageToDrive
from ..export.table_to_drive import TableToDrive
from ..format import format_bytes
from ..task.task import ProcessTask, ThreadTask, Task

logger = logging.getLogger(__name__)


class DownloadFeatures(ThreadTask):
    def __init__(
            self, download_dir, description, credentials, expression,
            data_sets, aoi, from_date, to_date, mask_snow, brdf_correct):
        super(DownloadFeatures, self).__init__('download_features')
        self.spec = TimeSeriesSpec(
            credentials, expression, data_sets, aoi, from_date, to_date,
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
            return Status(self.state)
        return Status(
            state=self.state,
            export_progress=sum([s.export_progress for s in statuses]) / len(statuses),
            download_progress=sum([s.download_progress for s in statuses]) / len(statuses),
            downloaded_bytes=sum([s.downloaded_bytes for s in statuses]),
            pre_process_progress=sum([s.pre_process_progress for s in statuses]) / len(statuses)
        )

    def status_description(self):
        return str(self.status())

    def close(self):
        Task.cancel_all(self.download_tasks)
        if self.drive_folder:
            drive.delete(self.spec.credentials, self.drive_folder)

    def __str__(self):
        return '{0}({1})'.format(type(self).__name__, self.spec)


class DownloadFeature(ThreadTask):
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
            return Status(self.state)
        return Status(
            state=self.state,
            export_progress=sum([s.export_progress for s in statuses]) / float(len(statuses)),
            download_progress=sum([s.download_progress for s in statuses]) / float(len(statuses)),
            downloaded_bytes=sum([s.downloaded_bytes for s in statuses]),
            pre_process_progress=sum([s.pre_process_progress for s in statuses]) / float(len(statuses))
        )

    def status_description(self):
        return str(self.status())

    def close(self):
        Task.cancel_all(self.download_tasks)

    def __str__(self):
        return '{0}({1})'.format(type(self).__name__, self.spec)

    def _preprocess_feature(self, value):
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


class DownloadYear(ThreadTask):
    def __init__(self, spec, drive_folder, download_dir, description, feature_description):
        super(DownloadYear, self).__init__()
        self._spec = spec
        self._drive_folder = drive_folder
        self._description = description
        self._feature_description = feature_description
        self._year = parse(spec.from_date).year
        self._table_export = None
        self._table_download = None
        self._image_export = None
        self._image_download = None
        self._process_year = None
        self._year_dir = '/'.join([download_dir, self._description, self._feature_description, str(self._year)])

    def run(self):
        ee.InitializeThread(self._spec.credentials)
        time_series = TimeSeries(self._spec)
        stack = time_series.stack
        dates = time_series.dates

        self._table_export = self.dependent(
            TableToDrive(
                credentials=self._spec.credentials,
                table=dates,
                description='_'.join([self._description, self._feature_description, str(self._year), 'dates']),
                folder=self._drive_folder
            ))
        self._table_download = self.dependent(
            Download(
                credentials=self._spec.credentials,
                drive_path=self._drive_folder,
                destination_path=self._year_dir,
                matching='{0}/{1}*.csv'.format(self._drive_folder, self._table_export.description),
                move=True,
                touch=True
            ))
        self._image_export = self.dependent(
            ImageToDrive(
                credentials=self._spec.credentials,
                image=stack,
                region=self._spec.aoi,
                description='_'.join([self._description, self._feature_description, str(self._year), 'stack']),
                folder=self._drive_folder,
                scale=30,
                maxPixels=1e12,
                shardSize=256,
                fileDimensions=4096
            ))
        self._image_download = self.dependent(
            Download(
                credentials=self._spec.credentials,
                drive_path=self._drive_folder,
                destination_path=self._year_dir,
                matching='{0}/{1}*.tif'.format(self._drive_folder, self._image_export.description),
                move=True,
                touch=True
            ))

        self._process_year = self.dependent(
            ProcessYear(self._year_dir))

        Task.submit_all([
            self._table_export.submit()
                .then(self._table_download.submit, self.reject).catch(self.reject),
            self._image_export.submit()
                .then(self._image_download.submit, self.reject).catch(self.reject)
        ]) \
            .then(self._process_year.submit, self.reject) \
            .then(self.resolve, self.reject)

    def status(self):
        table_export_progress = 1 if self._table_export and self._table_export.resolved() else 0
        image_export_progress = 1 if self._image_export and self._image_export.resolved() else 0

        table_download_progress = 1 if self._table_download and self._table_download.resolved() else 0
        image_download_progress = 1 if self._image_download and self._image_download.resolved() else 0

        table_downloaded_bytes = self._table_download.status().downloaded_bytes if self._table_download else 0
        image_downloaded_bytes = self._image_download.status().downloaded_bytes if self._image_download else 0

        return Status(
            state=self.state,
            export_progress=table_export_progress * 0.01 + image_export_progress * 0.99,
            download_progress=table_download_progress * 0.01 + image_download_progress * 0.99,
            downloaded_bytes=table_downloaded_bytes + image_downloaded_bytes,
            pre_process_progress=1 if self.resolved() else 0
        )

    def status_description(self):
        return str(self.status())

    def __str__(self):
        return '{0}({1})'.format(type(self).__name__, self._spec)


class ProcessYear(ProcessTask):
    def __init__(self, year_dir):
        super(ProcessYear, self).__init__()
        self._year_dir = year_dir

    def run(self):
        parent_dir = join(self._year_dir, pardir)
        tif_names = [f for f in listdir(self._year_dir) if f.endswith('.tif')]
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
                    .format(abspath(join(self._year_dir, tif_name)), abspath(join(tile_dir, tif_name))).split(' '))

        subprocess.check_call('mv {0} {1}'.format(join(self._year_dir, '*.csv'), parent_dir), shell=True)
        subprocess.check_call('rm -rf {0}'.format(self._year_dir).split(' '))
        return self.resolve()

    def __str__(self):
        return '{0}(year_dir={1})'.format(type(self).__name__, self._year_dir)


class Status(object):
    def __init__(self, state, export_progress=0, download_progress=0, downloaded_bytes=0, pre_process_progress=0):
        super(Status, self).__init__()
        self.state = state
        self.export_progress = export_progress
        self.download_progress = download_progress
        self.downloaded_bytes = downloaded_bytes
        self.pre_process_progress = pre_process_progress

    def __str__(self):
        if self.state == Task.RESOLVED:
            return 'Time-series downloaded'
        if self.state in [Task.SUBMITTED, Task.RUNNING]:
            return 'Exported {0}%, Downloaded {1}% ({2}), Processed {3}%'.format(
                int(round(self.export_progress * 100)),
                int(round(self.download_progress * 100)),
                format_bytes(self.downloaded_bytes),
                int(round(self.pre_process_progress * 100))
            )
        if self.state == Task.CANCELED:
            return 'Download was canceled'
        if self.state == Task.REJECTED:
            return 'Download failed: {}'.format(self.exception())




TimeSeriesSpec = namedtuple(
    'TimeSeriesSpec',
    'credentials, expression, data_sets, aoi, from_date, to_date, shadow_tolerance, mask_clouds, mask_snow, brdf_correct, target_day')


def _active(task):
    return task and task.active()


def _resolved(task):
    return task and task.resolved()


def _rejected(task):
    return task and task.rejected()
