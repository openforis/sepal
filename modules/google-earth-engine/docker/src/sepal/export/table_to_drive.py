import logging

import ee

from monitor import MonitorEarthEngineExportTask
from ..task import Task

logger = logging.getLogger(__name__)


class TableToDrive(Task):
    def __init__(self, credentials, table, description, folder, fileFormat='CSV'):
        super(TableToDrive, self).__init__('EarthEngineTableToDrive')
        self.credentials, self.table, self.description, self.folder, self.fileFormat = (
            credentials, table, description, folder, fileFormat)
        self.monitor_task = None

    def run(self):
        logger.info('Exporting Earth Engine table to drive. description: {0}, folder: {1}'
                    .format(self.description, self.folder))
        ee.InitializeThread(self.credentials)
        task_id = self._table_to_drive()
        self.monitor_task = MonitorEarthEngineExportTask(self.credentials, task_id, self.description)
        self.monitor_task.submit() \
            .then(self.resolve, self.reject)

    def close(self):
        Task.cancel_all([self.monitor_task])

    def _table_to_drive(self):
        task = ee.batch.Export.table.toDrive(
            collection=self.table,
            description=self.description,
            folder=self.folder,
            fileFormat=self.fileFormat
        )
        task.start()
        return task.status()['id']

    def __str__(self):
        return '{0}(description={1}, folder={2})'.format(type(self).__name__, self.description, self.folder)
