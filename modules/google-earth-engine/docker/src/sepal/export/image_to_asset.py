import logging

import ee

import monitor
from monitor import MonitorEarthEngineExportTask
from ..task.task import ThreadTask

logger = logging.getLogger(__name__)


class ImageToAsset(ThreadTask):
    def __init__(
            self,
            credentials,
            image,
            description,
            region,
            scale,
            maxPixels=1e12):
        super(ImageToAsset, self).__init__()
        self.credentials = credentials
        self.image = image
        self.description = description
        self.scale = scale
        self.region = region
        self.maxPixels = maxPixels
        self._monitor = None

    def status(self):
        if self._monitor:
            return self._monitor.status()
        else:
            return monitor.State.PENDING

    def status_message(self):
        if not self._monitor:
            return 'Export pending...'
        else:
            return self._monitor.status_message()

    def run(self):
        ee.InitializeThread(self.credentials)
        task_id = self._image_to_asset()
        self._monitor = MonitorEarthEngineExportTask(self.credentials, task_id, self.description)
        self.dependent(self._monitor) \
            .submit() \
            .then(self.resolve, self.reject)

    def _image_to_asset(self):
        asset_roots = ee.data.getAssetRoots()
        if not asset_roots:
            raise Exception('User has no GEE asset roots: {}'.format(self.credentials))
        asset_id = asset_roots[0]['id'] + '/' + self.description
        task = ee.batch.Export.image.toAsset(
            image=self.image,
            description=self.description,
            assetId=asset_id,
            region=self.region.bounds().getInfo()['coordinates'],
            scale=self.scale,
            maxPixels=self.maxPixels
        )
        task.start()
        return task.status()['id']

    def __str__(self):
        return '{0}(description={1})'.format(type(self).__name__, self.description)
