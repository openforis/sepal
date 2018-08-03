import ee
import landcoverPackage

from ..export.image_to_asset import ImageToAsset
from ..task.task import ThreadTask, Task
from ..aoi import Aoi


def create(spec, context):
    return CreateComposites(context.credentials, spec)


class CreateComposites(ThreadTask):
    def __init__(self, credentials, spec):
        super(CreateComposites, self).__init__('create_composites')
        self.credentials = credentials
        self.asset_path = spec['assetPath']
        self.from_year = spec['startYear']
        self.to_year = spec['endYear']
        self.aoi = Aoi.create(spec['aoi']).geometry()
        self.sensors = spec['sensors']
        self.scale = spec['scale']
        self.tasks = []

    def run(self):
        ee.InitializeThread(self.credentials)

        self.tasks = [
            self._create_composite_task(year, self.aoi)
            for year in range(self.from_year, self.to_year + 1)
        ]

        return Task.submit_all(self.tasks) \
            .then(self.resolve, self.reject)

    def status_message(self):
        completed = len([task for task in self.tasks if task.state == Task.RESOLVED])
        total = len(self.tasks)
        return 'Created composite {0} of {1}'.format(completed, total)

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
                region=self.aoi.bounds(),
                description=None,
                assetPath='{0}-{1}'.format(self.asset_path, year),
                scale=self.scale
            ))

    def __str__(self):
        return '{0}()'.format(
            type(self).__name__, self.from_year, self.to_year, str(self.aoi)
        )


def create_composite(year, aoi, sensors):
    '''
    Creates composite for the given year and AOI, using provided sensors.
    :param year: The year to create composite for
    :param aoi: The area of interest as an ee.Feature
    :param sensors: A list of sensors
    :return: A composite as an ee.Image
    '''
    return landcoverPackage.composite(aoi=aoi, year=year, sensors=sensors)
