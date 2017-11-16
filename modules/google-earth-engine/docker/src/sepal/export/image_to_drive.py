import logging

import ee

from monitor import MonitorEarthEngineExportTask
from ..task import Task

logger = logging.getLogger(__name__)


class ImageToDrive(Task):
    def __init__(
            self,
            credentials,
            image,
            description,
            region,
            folder,
            scale,
            maxPixels=1e12,
            shardSize=256,
            fileDimensions=4096,
            skipEmptyTiles=None):
        super(ImageToDrive, self).__init__('EarthEngineImageToDrive')
        self.credentials, self.image, self.description, self.folder, self.scale, self.region, self.maxPixels, \
        self.shardSize, self.fileDimensions, self.skipEmptyTiles = (
            credentials, image, description, folder, scale, region, maxPixels, shardSize, fileDimensions, skipEmptyTiles
        )

        self.monitor_task = None

    def run(self):
        ee.InitializeThread(self.credentials)
        task_id = self._image_to_drive()
        self.monitor_task = MonitorEarthEngineExportTask(self.credentials, task_id, self.description)
        self.monitor_task.submit() \
            .then(self.resolve, self.reject)

    def close(self):
        Task.cancel_all([self.monitor_task])

    def _image_to_drive(self):
        task = ee.batch.Export.image.toDrive(
            image=self.image,
            description=self.description,
            folder=self.folder,
            region=self.region.bounds().getInfo()['coordinates'],
            scale=self.scale,
            maxPixels=self.maxPixels,
            shardSize=self.shardSize,
            fileDimensions=self.fileDimensions,
            skipEmptyTiles=self.skipEmptyTiles
        )
        task.start()
        return task.status()['id']

    def __str__(self):
        return '{0}(description={1}, folder={2})'.format(type(self).__name__, self.description, self.folder)
