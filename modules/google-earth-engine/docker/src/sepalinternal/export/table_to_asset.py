import logging

import ee

from monitor import MonitorEarthEngineExportTask
from ..gee import export_semaphore
from ..task.task import ThreadTask

logger = logging.getLogger(__name__)


class TableToAsset(ThreadTask):
    def __init__(self, credentials, table, asset_id, retries=2):
        super(TableToAsset, self).__init__('EarthEngineTableToAsset', retries, semaphore=export_semaphore)
        self.credentials, self.table, self.asset_id = (
            credentials, table, asset_id
        )

    def run(self):
        logger.info('Exporting Earth Engine table to asset. asset_id: {0}'
                    .format(self.asset_id))
        ee.InitializeThread(self.credentials)
        task_id = self._table_to_asset()
        self.dependent(
            MonitorEarthEngineExportTask(self.credentials, task_id, self.asset_id)) \
            .submit() \
            .then(self.resolve, self.reject)

    def _table_to_asset(self):
        if ee.data.getInfo(self.asset_id):
            ee.data.deleteAsset(self.asset_id)

        description = self.asset_id.split('/')[-1]
        task = ee.batch.Export.table.toAsset(
            collection=self.table,
            description=description,
            assetId=self.asset_id
        )
        task.start()
        return task.status()['id']

    def __str__(self):
        return '{0}(asset_id={1})'.format(type(self).__name__, self.asset_id)
