import ee
from promise import Promise

from ..export.image_to_asset import ImageToAsset
from ..export.table_to_drive import TableToDrive
from ..task.task import ThreadTask, Task


def create(spec, context):
    return CreateLandCoverMap(context.credentials, spec)


class CreateLandCoverMap(ThreadTask):
    def __init__(self, credentials, spec):
        super(CreateLandCoverMap, self).__init__('create_land_cover_map')
        self.credentials = credentials
        self.asset_path = spec['assetPath']
        self.scale = spec['scale']
        self.years = spec['years']

        self.primitive_tasks = self._create_primitive_tasks()

    def run(self):
        ee.InitializeThread(self.credentials)
        return Task.submit_all(self.primitive_tasks) \
            .then(self._assemble, self.reject) \
            .then(self.resolve, self.reject)

        # TODO: Add a thematic smoothing step

    def _create_primitive_tasks(self):
        primitive_tasks = []
        for year, year_spec in self.years.iteritems():
            year = int(year)
            for primitive_type, training_data_fusion_table in year_spec['trainingDataFusionTables'].iteritems():
                primitive_tasks.append(
                    CreatePrimitive(
                        credentials=self.credentials,
                        scale=self.scale,
                        year=year,
                        primitive_type=primitive_type,
                        training_data_fusion_table=training_data_fusion_table,
                        asset_path=self.asset_path
                    ))
        return primitive_tasks

    def status_message(self):
        return 'Some CreateLandCoverMap status message'

    def _assemble(self, value):
        primative_collection = ee.ImageCollection([task.primitive_asset() for task in self.primitive_tasks])
        primitive_accuracy_collection = ee.ImageCollection([task.accuracy_asset() for task in self.primitive_tasks])

        tasks = []
        for year in self.years:
            year = int(year)
            export_primitive, export_probability = self._assemble_year(
                year,
                primative_collection,
                primitive_accuracy_collection
            )
            tasks.append(export_primitive)
            tasks.append(export_probability)
        return Task.submit_all(tasks)

    def _assemble_year(self, year, primative_collection, primitive_accuracy_collection):
        print('_assemble_year(year={0}, primative_collection.size={1}, primitive_accuracy_collection.size={2})'.format(
            year, primative_collection.size().getInfo(), primitive_accuracy_collection.size().getInfo()))
        year_filter = ee.Filter.eq('year', year)
        (primitive, probability) = assemble(
            year=year,
            primative_collection=primative_collection.filter(year_filter),
            primitive_accuracy_collection=primitive_accuracy_collection.filter(year_filter)
        )
        export_primitive = self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=primitive,
                region=primitive.geometry(),
                description=None,
                assetPath='{0}-{1}-assembled'.format(self.asset_path, year),
                scale=self.scale
            ))
        export_probability = self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=probability,
                region=probability.geometry(),
                description=None,
                assetPath='{0}-{1}-assembled_probability'.format(self.asset_path, year),
                scale=self.scale
            ))
        return export_primitive, export_probability

    def __str__(self):
        return '{0}()'.format(
            type(self).__name__
        )


class CreatePrimitive(ThreadTask):
    def __init__(self, credentials, scale, year, asset_path, primitive_type, training_data_fusion_table):
        super(CreatePrimitive, self).__init__('create_primitive')
        self.credentials = credentials
        self.scale = scale
        self.year = year
        self.primitive_name = primitive_type
        self.training_data_fusion_table = training_data_fusion_table
        self.asset_path = asset_path
        self.composite = ee.Image(_to_asset_id('{0}-{1}'.format(asset_path, year)))

    def run(self):
        ee.InitializeThread(self.credentials)
        return self._sample() \
            .then(self._export_sample_csv_to_fusion_table, self.reject) \
            .then(self._create_primitive, self.reject) \
            .then(self.resolve, self.reject)

    def primitive_asset(self):
        return ee.Image(_to_asset_id(self.primitive_asset_path()))

    def primitive_asset_path(self):
        return '{0}-{1}-{2}-map'.format(self.asset_path, self.year, self.primitive_name)

    def accuracy_asset(self):
        return ee.Image(_to_asset_id(self.accuracy_asset_path()))

    def accuracy_asset_path(self):
        return '{0}-{1}-{2}-accuracy'.format(self.asset_path, self.year, self.primitive_name)

    def _sample(self):
        samples = sample(
            composite=self.composite,
            training_data=ee.FeatureCollection('ft:' + self.training_data_fusion_table)
        )
        return self.dependent(
            TableToDrive(
                credentials=self.credentials,
                table=samples,
                description='sampled-data-{0}-{1}'.format(self.year, self.primitive_name),
                folder=None,  # TODO: Create single folder for land cover map
                fileFormat='CSV'
            )).submit()

    def _export_sample_csv_to_fusion_table(self, value):
        # TODO: Implement...
        print('_export_sample_to_ft: ', value)
        return Promise.resolve('1GnoD3wtYpi0jSwyh1FqsfMdzCs135TDJjMFcjvI8')

    def _create_primitive(self, sample_fusion_table):
        (primitive, accuracy) = create_primitive(
            year=self.year,
            type=self.primitive_name,
            composite=self.composite,
            training_data=ee.FeatureCollection('ft:' + sample_fusion_table)
        )

        export_primitive = self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=primitive,
                region=primitive.geometry(),
                description=None,
                assetPath=self.primitive_asset_path(),
                scale=self.scale
            ))

        export_accuracy = self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=accuracy,
                region=primitive.geometry(),
                description=None,
                assetPath=self.accuracy_asset_path(),
                scale=self.scale
            ))
        return Task.submit_all([export_primitive, export_accuracy])


def _to_asset_id(asset_path):
    asset_roots = ee.data.getAssetRoots()
    if not asset_roots:
        raise Exception('User has no GEE asset roots')
    return asset_roots[0]['id'] + '/' + asset_path


# TODO: Dummy implementations

def sample(composite, training_data):
    '''
    Samples provided composite.
    :param composite: The composite to sample as an ee.Image
    :param training_data: ee.FeatureCollection of training data
    :return: ee.FeatureCollection with sampled data.
    '''
    return composite.sampleRegions(
        collection=training_data,
        properties=['class'],
        scale=1
    )


def create_primitive(year, type, composite, training_data):
    '''
    Creates primitive for year of the specified type, based on provided training data.
    :param year: The year to create primitive for
    :param type: The type of primitive to create
    :param composite: The composite to create the primitive for as ee.Image
    :param training_data: ee.ImageCollection with the training data and sampled properties
    :return: An ee.Image with the primitive and an ee.Image with the accuracy, both with a year property set.
    '''
    classifier = ee.Classifier.cart().train(
        training_data, 'class',
        inputProperties=['B4'])
    primitive = composite.classify(classifier.setOutputMode('CLASSIFICATION')).rename(['class']) \
        .set('year', year)
    accuracy = ee.Image(0.5).clip(primitive.geometry()) \
        .set('year', year)
    return (primitive, accuracy)


def assemble(year, primative_collection, primitive_accuracy_collection):
    '''
    Assembles the primitives for a year.
    :param year: The year of the assembly
    :param primative_collection: ee.ImageCollection of primitives for the year
    :param primitive_accuracy_collection: ee.ImageCollection of primitive accuracies for the year
    :return: ee.Image with land cover layers and ee.Image with class probabilities
    '''
    print('assemble(year={0}, primative_collection.size={1}, primitive_accuracy_collection.size={2})'.format(
        year, primative_collection.size().getInfo(), primitive_accuracy_collection.size().getInfo()))
    return (primative_collection.first(), primitive_accuracy_collection.first())
