import ee
from landcoverPackage import landsat

from ..aoi import Aoi
from ..export.image_to_asset import ImageToAsset
from ..gee import create_asset_image_collection, to_asset_id
from ..task.task import ThreadTask, Task


def create(spec, context):
    return CreateComposites(context.credentials, spec)


class CreateComposites(ThreadTask):
    def __init__(self, credentials, spec):
        super(CreateComposites, self).__init__('create_composites')
        self.credentials = credentials
        recipe = spec['recipe']
        model = recipe['model']
        self.asset_path = recipe.get('title', recipe['placeholder'])
        self.from_year = model['period']['startYear']
        self.to_year = model['period']['endYear']
        self.aoi = Aoi.create(model['aoi']).geometry()
        self.sensors = ['L8', 'L7']
        self.scale = 30
        composite_options = model['compositeOptions']
        self.cloud_threshold = composite_options['cloudThreshold']
        self.corrections = composite_options['corrections']
        self.mask = composite_options['mask']
        self.tasks = []

    def run(self):
        ee.InitializeThread(self.credentials)
        return self.pipe(
            self._create_composites
        )

    def _create_composites(self):
        create_asset_image_collection(to_asset_id(self.asset_path + '/composites'))
        self.tasks = [
            self._create_composite_task(year)
            for year in range(self.from_year, self.to_year + 1)
        ]
        return Task.submit_all(self.tasks)

    def status_message(self):
        completed = len([task for task in self.tasks if task.state == Task.RESOLVED])
        total = len(self.tasks)
        return 'Created composite {0} of {1}'.format(completed, total)

    def _create_composite_task(self, year):
        composite = self._create_composite(
            year=year
        )
        return self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=composite,
                region=self.aoi.bounds(),
                description=None,
                assetId=to_asset_id('{0}/composites/{1}'.format(self.asset_path, year)),
                scale=self.scale,
                retries=5
            ))

    def _create_composite(self, year):
        '''
        Creates composite for the given year and AOI, using provided sensors.
        :param year: The year to create composite for
        :param aoi: The area of interest as an ee.Feature
        :param sensors: A list of sensors
        :return: A composite as an ee.Image
        '''
        functions = landsat.functions()
        env = functions.env
        env.metadataCloudCoverMax = self.cloud_threshold + 1 # Add 1 since it's a strict less_then filtering
        env.cloudMask = 'CLOUDS' in self.mask
        env.hazeMask = 'HAZE' in self.mask
        env.shadowMask = 'SHADOW' in self.mask
        env.brdfCorrect = 'BRDF' in self.corrections
        env.terrainCorrection = 'TERRAIN' in self.corrections

        # TODO:
        return functions.getLandsat(self.aoi, year)

    def __str__(self):
        return '{0}()'.format(
            type(self).__name__, self.from_year, self.to_year, str(self.aoi)
        )
