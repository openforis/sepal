import ee

from ..export.image_to_asset import ImageToAsset
from ..task.task import ThreadTask, Task


def create(spec, context):
    return CreateComposites(context.credentials, spec)


class CreateComposites(ThreadTask):
    def __init__(self, credentials, spec):
        super(CreateComposites, self).__init__('create_composites')
        self.credentials = credentials
        self.asset_path = spec['assetPath']
        self.from_year = spec['fromYear']
        self.to_year = spec['toYear']
        self.aoi_fusion_table = spec['aoiFusionTable']
        self.key_column = spec['keyColumn']
        self.key_value = spec['keyValue']
        self.sensors = spec['sensors']
        self.scale = spec['scale']

    def run(self):
        ee.InitializeThread(self.credentials)
        aoi = self._aoi()

        self.tasks = [
            self._create_composite_task(year, aoi)
            for year in range(self.from_year, self.to_year + 1)
        ]

        return Task.submit_all(self.tasks) \
            .then(self.resolve, self.reject)

    def status_message(self):
        completed = len([task for task in self.tasks if task.state == Task.RESOLVED])
        total = len(self.tasks)
        return 'Created composite {0} of {1}'.format(completed, total)

    def _aoi(self):
        return ee.FeatureCollection('ft:' + self.aoi_fusion_table) \
            .filterMetadata(self.key_column, 'equals', self.key_value) \
            .geometry()

    def _create_composite_task(self, year, aoi):
        composite = create_composite(
            year=year,
            aoi=aoi,
            sensors=self.sensors
        )
        return self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=composite,
                region=composite.geometry().bounds(),
                description=None,
                assetPath='{0}-{1}'.format(self.asset_path, year),
                scale=self.scale
            ))

    def __str__(self):
        return '{0}()'.format(
            type(self).__name__, self.from_year, self.to_year, self.aoi_fusion_table, self.key_column, self.key_value,
            self.sensors
        )


def create_composite(year, aoi, sensors):
    return ee.Image(ee.ImageCollection('LANDSAT/LC08/C01/T1_SR') \
                    .filterDate(str(year) + '-01-01', str(year + 1) + '-01-01') \
                    .filterBounds(aoi) \
                    .first())
