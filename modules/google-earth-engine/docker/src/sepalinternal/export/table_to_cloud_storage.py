import logging

import ee

from .monitor import MonitorEarthEngineExportTask
from ..gee import export_semaphore
from ..task.task import ThreadTask

logger = logging.getLogger(__name__)


class TableToCloudStorage(ThreadTask):
    def __init__(self, credentials, table, description, folder, fileFormat='CSV'):
        super(TableToCloudStorage, self).__init__(
            'EarthEngineTableToCloudStorage',
            etries=3,
            semaphore=export_semaphore
        )
        self.credentials, self.table, self.description, self.folder, self.fileFormat = (
            credentials, table, description, folder, fileFormat)

    def run(self):
        logger.info('Exporting Earth Engine table to cloud storage. description: {0}, folder: {1}'
                    .format(self.description, self.folder))
        ee.InitializeThread(self.credentials)
        task_id = self._table_to_cloud_storage()
        self.dependent(
            MonitorEarthEngineExportTask(self.credentials, task_id, self.description)) \
            .submit() \
            .then(self.resolve, self.reject)

    def _table_to_cloud_storage(self):
        task = ee.batch.Export.table.toCloudStorage(
            collection=self.table,
            bucket='sepal_dev-daniel_exports',
            description=self.description,
            fileNamePrefix=self.folder + '/',
            fileFormat=self.fileFormat
        )
        task.start()
        return task.status()['id']

    def __str__(self):
        return '{0}(description={1}, folder={2})'.format(type(self).__name__, self.description, self.folder)
