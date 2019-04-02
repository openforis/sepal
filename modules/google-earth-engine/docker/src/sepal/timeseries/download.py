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
from ..gee import get_info

import ee
from osgeo import gdal
from dateutil.parser import parse

from timeseries import TimeSeries
from .. import drive
from ..aoi import Aoi
from ..drive import Download
from ..export.image_to_drive import ImageToDrive
from ..export.table_to_drive import TableToDrive
from ..format import format_bytes
from ..task.task import ThreadTask, Task

logger = logging.getLogger(__name__)


def create(spec, context):
    aoi_spec = spec['aoi']
    if aoi_spec['type'] == 'FUSION_TABLE' and not aoi_spec.get('keyColumn'):
        aoi = ee.FeatureCollection('ft:' + aoi_spec['id'])
    else:
        aoi = Aoi.create(aoi_spec).geometry()
    return DownloadFeatures(
        username=context.username,
        download_dir=context.download_dir,
        description=spec['description'],
        credentials=context.credentials,
        expression=spec['expression'],
        data_sets=spec['dataSets'],
        aoi=aoi,
        from_date=spec['fromDate'],
        to_date=spec['toDate'],
        mask_snow=spec['maskSnow'],
        brdf_correct=spec['brdfCorrect'],
        surface_reflectance=spec['surfaceReflectance']
    )


class DownloadFeatures(ThreadTask):
    def __init__(
            self, username, download_dir, description, credentials, expression,
            data_sets, aoi, from_date, to_date, mask_snow, brdf_correct, surface_reflectance):
        super(DownloadFeatures, self).__init__('download_features')
        self.spec = TimeSeriesSpec(
            credentials=credentials,
            expression=expression,
            data_sets=data_sets,
            aoi=aoi,
            from_date=from_date,
            to_date=to_date,
            shadow_tolerance=1,
            mask_clouds=True,
            mask_snow=mask_snow,
            brdf_correct=brdf_correct,
            surface_reflectance=surface_reflectance,
            target_day=0,
            masked_on_analysis=False,
            bands=[],
            calibrate=False
        )
        self.download_dir = download_dir
        self.description = description
        self.download_tasks = []
        self.drive_folder_name = '_'.join(['Sepal', self.description, str(uuid.uuid4())])
        self.drive_folder = None

    def run(self):
        ee.InitializeThread(self.spec.credentials)
        # Explicitly create folder, to prevent GEE race-condition
        self.drive_folder = drive.create_folder(self.spec.credentials, self.drive_folder_name)
        self.dependent(drive.Touch([self.drive_folder_name])).submit()
        if isinstance(self.spec.aoi, ee.FeatureCollection):
            feature_collection = self.spec.aoi
            aois = [
                ee.Feature(
                    feature_collection.filterMetadata('system:index', 'equals', feature_index).first()).geometry()
                for feature_index in get_info(feature_collection.aggregate_array('system:index'))
            ]
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
            return Status(self.state, exception=self.exception())
        return Status(
            state=self.state,
            export_progress=sum([s.export_progress for s in statuses]) / len(statuses),
            download_progress=sum([s.download_progress for s in statuses]) / len(statuses),
            downloaded_bytes=sum([s.downloaded_bytes for s in statuses]),
            pre_process_progress=sum([s.pre_process_progress for s in statuses]) / len(statuses),
            exception=self.exception()
        )

    def status_message(self):
        return str(self.status())

    def close(self):
        for task in self.download_tasks:
            task.cancel()
        if self.drive_folder:
            drive.delete(self.spec.credentials, self.drive_folder)

    def __str__(self):
        return '{0}(download_dir={1}, description={2}, credentials={3}, expression={4}, data_sets={5}, ' \
               'from_date={6}, to_date={7}, mask_snow={8}, brdf_correct={9})'.format(
            type(self).__name__, self.download_dir, self.description, self.spec.credentials, self.spec.expression,
            self.spec.data_sets, self.spec.from_date, self.spec.to_date, self.spec.mask_snow,
            self.spec.brdf_correct)


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
            .then(self._preprocess_feature, self.reject) \
            .catch(self.reject)

    def close(self):
        for task in self.download_tasks:
            task.cancel()

    def status(self):
        statuses = [task.status() for task in self.download_tasks]
        if not statuses:
            return Status(self.state, exception=self.exception())
        return Status(
            state=self.state,
            export_progress=sum([s.export_progress for s in statuses]) / float(len(statuses)),
            download_progress=sum([s.download_progress for s in statuses]) / float(len(statuses)),
            downloaded_bytes=sum([s.downloaded_bytes for s in statuses]),
            pre_process_progress=sum([s.pre_process_progress for s in statuses]) / float(len(statuses)),
            exception=self.exception()
        )

    def status_message(self):
        return str(self.status())

    def _preprocess_feature(self, value):
        if not self._create_dates_csv():
            return self.resolve()
        self._tiles_to_vrts()
        return self.resolve()

    def _create_dates_csv(self):
        dates_path = join(self.feature_dir, 'dates.csv')
        csv_paths = sorted(glob(join(self.feature_dir, '*.csv')))
        if dates_path in csv_paths:
            csv_paths.remove(dates_path)
        if not csv_paths:
            return False
        with open(dates_path, 'w') as dates_file:
            for csv_path in csv_paths:
                with open(csv_path, 'r') as csv_file:
                    for row in csv.DictReader(csv_file):
                        if row['date']:
                            dates_file.write(row['date'] + '\n')
                subprocess.check_call('rm -rf {0}'.format(csv_path).split(' '))
            dates_file.flush()
            os.fsync(dates_file.fileno())
        return True

    def _tiles_to_vrts(self):
        tile_dirs = sorted([d for d in glob(join(self.feature_dir, '*')) if isdir(d)])
        for tile_dir in tile_dirs:
            self._tile_to_vrt(tile_dir)
        gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
        vrt = gdal.BuildVRT(
            self.feature_dir + '/stack.vrt', sorted(glob(join(self.feature_dir, '*.vrt'))),
            VRTNodata=0
        )
        if vrt:
            vrt.FlushCache()

    def _tile_to_vrt(self, tile_dir):
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
                        VRTNodata=0)
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

    def __str__(self):
        return '{0}(drive_folder={1}, download_dir={2}, description={3}, feature_description={4}, spec={5})'.format(
            type(self).__name__, self.drive_folder, self.download_dir, self.description, self.feature_description,
            self.spec)


class DownloadYear(ThreadTask):
    def __init__(self, drive_folder, download_dir, description, feature_description, spec):
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
        if not get_info(dates.size()):
            return self.resolve()

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
                move=True
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
                fileDimensions=1024
            ))
        self._image_download = self.dependent(
            Download(
                credentials=self._spec.credentials,
                drive_path=self._drive_folder,
                destination_path=self._year_dir,
                matching='{0}/{1}*.tif'.format(self._drive_folder, self._image_export.description),
                move=True
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
            pre_process_progress=1 if self.resolved() else 0,
            exception=self.exception()
        )

    def status_message(self):
        return str(self.status())

    def __str__(self):
        return '{0}(drive_folder={1}, year_dir={2}, description={3}, feature_description={4}, spec={5})'.format(
            type(self).__name__, self._drive_folder, self._year_dir, self._description, self._feature_description,
            self._spec)


class ProcessYear(ThreadTask):
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
                'mv {0} {1}'.format(abspath(join(self._year_dir, tif_name)), abspath(join(tile_dir, tif_name))),
                shell=True)

        subprocess.check_call('mv {0} {1}'.format(join(self._year_dir, '*.csv'), parent_dir), shell=True)
        subprocess.check_call('rm -rf {0}'.format(self._year_dir).split(' '))
        return self.resolve()

    def __str__(self):
        return '{0}(year_dir={1})'.format(type(self).__name__, self._year_dir)


class Status(object):
    def __init__(self, state, export_progress=0, download_progress=0, downloaded_bytes=0, pre_process_progress=0,
                 exception=None):
        super(Status, self).__init__()
        self.state = state
        self.export_progress = export_progress
        self.download_progress = download_progress
        self.downloaded_bytes = downloaded_bytes
        self.pre_process_progress = pre_process_progress
        self.exception = exception

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
            if self.exception:
                return 'Download failed: {}'.format(self.exception.message)
            else:
                'Download failed'


TimeSeriesSpec = namedtuple(
    'TimeSeriesSpec',
    'credentials, expression, data_sets, aoi, from_date, to_date, surface_reflectance, shadow_tolerance, mask_clouds, '
    'mask_snow, brdf_correct, target_day, masked_on_analysis, bands, calibrate')


def _active(task):
    return task and task.active()


def _resolved(task):
    return task and task.resolved()


def _rejected(task):
    return task and task.rejected()
