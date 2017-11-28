import json
from collections import namedtuple

from .. import image_spec_factory
from ..export.image_to_asset import ImageToAsset
from ..task.task import ThreadTask


def create(spec, context):
    return AssetExport(
        credentials=context.credentials,
        description=spec['description'],
        image_spec=spec['image']
    )


class AssetExport(ThreadTask):
    Status = namedtuple('DownloadMosaicToSepalStatus',
                        'state, export_status, download_status, '
                        'set_band_names_status, build_vrt_status, build_overviews_status')

    def __init__(self, credentials, description, image_spec):
        super(AssetExport, self).__init__()
        self.credentials = credentials
        self.description = description
        self.image_spec = image_spec

        self._export = None

    def run(self):
        image_spec = image_spec_factory.create(self.image_spec)
        self._export = self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=image_spec._ee_image(),
                region=image_spec.aoi.geometry(),
                description=self.description,
                scale=30
            ))

        return self._export.submit() \
            .then(self.resolve, self.reject)

    def status_message(self):
        if self.resolved():
            'Image exported'
        if self.active():
            return 'Exporting Google Earth Engine Asset...'
        if self.canceled():
            return 'Export was canceled'
        if self.rejected():
            return 'Export failed: {}'.format(self.exception())

    def __str__(self):
        return '{0}(description={1}, spec={2})' \
            .format(type(self).__name__, self.description, self.image_spec)
