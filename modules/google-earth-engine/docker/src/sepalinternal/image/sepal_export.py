import uuid
from collections import namedtuple

import ee

from build_overviews import BuildOverviews
from build_vrt import BuildVrt
from set_band_names import SetBandNames
from .. import drive
from .. import image_spec_factory
from ..drive import Download
from ..export.image_to_drive import ImageToDrive
from ..format import format_bytes
from ..task.task import ThreadTask


def create(spec, context):
    return SepalExport(
        sepal_api=context.sepal_api,
        credentials=context.credentials,
        download_dir=context.download_dir,
        description=spec['description'],
        image_spec=spec['image']
    )


class SepalExport(ThreadTask):
    Status = namedtuple('DownloadMosaicToSepalStatus',
                        'state, export_status, download_status, '
                        'set_band_names_status, build_vrt_status, build_overviews_status')

    def __init__(self, sepal_api, credentials, download_dir, description, image_spec):
        super(SepalExport, self).__init__(retries=3)
        self.sepal_api = sepal_api
        self.credentials = credentials
        self.drive_path = '_'.join(['Sepal', description, str(uuid.uuid4())])
        self.download_dir = download_dir
        self.description = description
        self.image_spec = image_spec
        self._drive_folder = None

        self._export = None
        self._download = None
        self._set_band_names = None
        self._build_vrt = None
        self._build_overviews = None

    def run(self):
        ee.InitializeThread(self.credentials)
        self._drive_folder = drive.create_folder(self.credentials, self.drive_path)
        self.dependent(drive.Touch([self.drive_path], self.credentials)).submit()
        image_spec = image_spec_factory.create(self.sepal_api, self.image_spec)
        self._export = self.dependent(
            ImageToDrive(
                credentials=self.credentials,
                image=image_spec._ee_image(),
                region=image_spec.aoi.geometry(),
                description=self.description,
                folder=self.drive_path,
                scale=image_spec.scale,
                maxPixels=1e12,
                shardSize=256,
                fileDimensions=4096
            ))
        destination_path = self.download_dir + '/' + self.description
        self._download = self.dependent(
            Download(
                credentials=self.credentials,
                drive_path=self.drive_path,
                destination_path=destination_path,
                move=True
            ))
        tifs = destination_path + '/*.tif'
        self._build_vrt = self.dependent(
            BuildVrt(destination_path + '/' + self.description + '.vrt', tifs))
        self._set_band_names = self.dependent(
            SetBandNames(image_spec.bands, [tifs, destination_path + '/*.vrt']))
        self._build_overviews = self.dependent(
            BuildOverviews(destination_path + '/*.vrt'))

        return self._export.submit() \
            .then(self._download.submit, self.reject) \
            .then(self._build_vrt.submit, self.reject) \
            .then(self._set_band_names.submit, self.reject) \
            .then(self._build_overviews.submit, self.reject) \
            .then(self.resolve, self.reject)

    def status_message(self):
        status = self.status()
        if self.resolved():
            return 'Image downloaded'
        if self.active():
            if status.is_current_task(self._export):
                return 'Exporting from Google Earth Engine...'
            if status.is_current_task(self._download):
                download_status = self._download.status()
                if download_status.total_files:
                    return 'Downloaded {downloaded_files} of {total_files} files ({downloaded} of {total})'.format(
                        downloaded_files=download_status.downloaded_files,
                        total_files=download_status.total_files,
                        downloaded=format_bytes(download_status.downloaded_bytes),
                        total=format_bytes(download_status.total_bytes),
                    )
                else:
                    return 'Starting download to Sepal...'
            if status.is_current_task(self._build_vrt):
                return 'Building VRT...'
            if status.is_current_task(self._set_band_names):
                return 'Setting band names...'
            if status.is_current_task(self._build_overviews):
                return 'Building overviews...'
            return 'Exporting from Google Earth Engine...'
        if self.canceled():
            return 'Download was canceled'
        if self.rejected():
            if status.is_current_task(self._export):
                return 'Export from Google Earth Engine failed: {}'.format(self.exception())
            if status.is_current_task(self._download):
                return 'Download from Google Drive failed: {}'.format(self.exception())
            if status.is_current_task(self._set_band_names):
                return 'Failed to set band names: {}'.format(self.exception())
            if status.is_current_task(self._build_vrt):
                return 'Failed to build VRT: {}'.format(self.exception())
            if status.is_current_task(self._build_overviews):
                return 'Failed to build overview: {}'.format(self.exception())
            return 'Download failed: {}'.format(self.exception())

    def close(self):
        if self._drive_folder:
            drive.delete(self.credentials, self._drive_folder)

    def __str__(self):
        return '{0}(download_dir={1}, drive_folder={2}, description={3}, spec={4})' \
            .format(type(self).__name__, self.download_dir, self.drive_path, self.description, self.image_spec)
