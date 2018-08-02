import uuid

import ee
import landcoverPackage
from promise import Promise

from .. import drive
from ..export.image_to_asset import ImageToAsset
from ..task.task import ThreadTask, Task


def create(spec, context):
    return CreateLandCoverMap(context.credentials, spec)


class CreateLandCoverMap(ThreadTask):
    def __init__(self, credentials, spec):
        super(CreateLandCoverMap, self).__init__('create_land_cover_map')
        self.credentials = credentials
        self.asset_path = spec['assetPath']
        self.primitive_types = spec['primitiveTypes']
        self.start_year = spec['startYear']
        self.end_year = spec['endYear']
        self.training_data = spec['trainingData']
        self.scale = spec['scale']
        self.drive_folder = None
        self.drive_folder_name = '_'.join(['Sepal', self.asset_path.split('/')[-1], str(uuid.uuid4())])

        self.primitive_tasks = None

    def run(self):
        ee.InitializeThread(self.credentials)
        self.drive_folder = drive.create_folder(self.credentials, self.drive_folder_name)
        self.primitive_tasks = self._create_primitive_tasks()
        return Task.submit_all(self.primitive_tasks) \
            .then(self._assemble, self.reject) \
            .then(self.resolve, self.reject)

    def close(self):
        if self.drive_folder:
            drive.delete(self.credentials, self.drive_folder)

    def _create_primitive_tasks(self):
        primitive_tasks = []
        for primitive_type in self.primitive_types:
            samples = self._sample_primitive(primitive_type)

            for year in range(self.start_year, self.end_year + 1):
                primitive_tasks.append(
                    CreatePrimitive(
                        credentials=self.credentials,
                        scale=self.scale,
                        year=year,
                        primitive_type=primitive_type,
                        samples=samples,
                        asset_path=self.asset_path,
                        drive_folder_name=self.drive_folder_name
                    ))
        return primitive_tasks

    def _sample_primitive(self, primitive_type):
        training_data_collection = ee.FeatureCollection('ft:' + self.training_data['tableId'])
        primitive_training_data_collection = self._to_primitive_training_data(
            training_data_collection=training_data_collection,
            year_column=self.training_data['yearColumn'],
            class_column=self.training_data['classColumn'],
            primitive_class=self.training_data['classByPrimitive'][primitive_type]
        )
        samples = ee.FeatureCollection([])
        for year in range(self.start_year, self.end_year + 1):
            composite = ee.Image(_to_asset_id('{0}-{1}'.format(self.asset_path, year)))
            yearly_training_data = primitive_training_data_collection \
                .filter(ee.Filter.eq('year', ee.Number(year)))
            yearly_sample = sample(composite=composite, training_data=yearly_training_data)
            samples = ee.FeatureCollection(samples.merge(yearly_sample).copyProperties(yearly_sample))
        return samples

    def _to_primitive_training_data(self, training_data_collection, year_column, class_column, primitive_class):
        def to_primitive_feature(feature, int_class):
            return feature \
                .set('class', int_class) \
                .set('year', feature.get(year_column))

        ee_primitive_class = ee.Number(int(primitive_class)) if primitive_class.isdigit() else primitive_class
        return ee.FeatureCollection(training_data_collection
                                    .filter(ee.Filter.eq(class_column, ee_primitive_class))
                                    .map(lambda feature: to_primitive_feature(feature, 1))
                                    .merge(
            training_data_collection.filter(ee.Filter.neq(class_column, ee_primitive_class))
                .map(lambda feature: to_primitive_feature(feature, 0))
        ).copyProperties(training_data_collection))

    def status_message(self):
        return 'Some CreateLandCoverMap status message'

    def _assemble(self, value):
        primitive_collection = ee.ImageCollection([task.primitive_asset() for task in self.primitive_tasks])

        tasks = []
        for year in range(self.start_year, self.end_year + 1):
            year = int(year)
            export_primitive, export_probability = self._assemble_year(
                year,
                primitive_collection
            )
            tasks.append(export_primitive)
            tasks.append(export_probability)
        return Task.submit_all(tasks)

    def _assemble_year(self, year, primitive_collection):
        year_filter = ee.Filter.eq('year', year)
        (primitive, probability) = assemble(
            year=year,
            primitive_collection=primitive_collection.filter(year_filter)
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
    def __init__(
            self,
            credentials,
            scale,
            year,
            asset_path,
            primitive_type,
            samples,
            drive_folder_name
    ):
        super(CreatePrimitive, self).__init__('create_primitive')
        self.credentials = credentials
        self.scale = scale
        self.year = year
        self.primitive_name = primitive_type
        self.samples = samples
        self.asset_path = asset_path
        self.composite = ee.Image(_to_asset_id('{0}-{1}'.format(asset_path, year)))
        self.drive_folder_name = drive_folder_name

    def run(self):
        ee.InitializeThread(self.credentials)
        return self._create_primitive(self.samples) \
            .then(self.resolve, self.reject)

        # return self._sample() \
        #     .then(self._export_sample_csv_to_fusion_table, self.reject) \
        #     .then(self._create_primitive, self.reject) \
        #     .then(self.resolve, self.reject)

    def primitive_asset(self):
        return ee.Image(_to_asset_id(self.primitive_asset_path()))

    def primitive_asset_path(self):
        return '{0}-{1}-{2}-map'.format(self.asset_path, self.year, self.primitive_name)

    # def _sample(self):
    #     samples = sample(
    #         composite=self.composite,
    #         training_data=ee.FeatureCollection('ft:' + self.training_data_fusion_table)
    #     )
    #     return self.dependent(
    #         TableToDrive(
    #             credentials=self.credentials,
    #             table=samples,
    #             description='sample-{0}-{1}'.format(self.year, self.primitive_name),
    #             folder=self.drive_folder_name,
    #             fileFormat='CSV'
    #         )).submit()

    def _export_sample_csv_to_fusion_table(self, value):
        # TODO: Implement...
        print('_export_sample_to_ft: ', value)
        return Promise.resolve('1GnoD3wtYpi0jSwyh1FqsfMdzCs135TDJjMFcjvI8')

    def _create_primitive(self, sampled_data):
        primitive = create_primitive(
            year=self.year,
            type=self.primitive_name,
            composite=self.composite,
            training_data=sampled_data
        )

        return self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=primitive,
                region=primitive.geometry(),
                description=None,
                assetPath=self.primitive_asset_path(),
                scale=self.scale
            )).submit()


def _to_asset_id(asset_path):
    asset_roots = ee.data.getAssetRoots()
    if not asset_roots:
        raise Exception('User has no GEE asset roots')
    return asset_roots[0]['id'] + '/' + asset_path


def _flatten(iterable):
    return [item for sublist in iterable for item in sublist]


def sample(composite, training_data):
    '''
    Samples provided composite.
    :param composite: The composite to sample as an ee.Image
    :param training_data: ee.FeatureCollection of training data
    :return: ee.FeatureCollection with sampled data.
    '''
    return landcoverPackage.sample(composite=composite, trainingData=training_data)


def create_primitive(year, type, composite, training_data):
    '''
    Creates primitive for year of the specified type, based on provided training data.
    :param year: The year to create primitive for
    :param type: The type of primitive to create
    :param composite: The composite to create the primitive for as ee.Image
    :param training_data: ee.FeatureCollection with the classes and sampled properties
    :return: An ee.Image with the primitive with a year property set.
    '''
    return landcoverPackage.primitive(
        year=year,
        primitiveType=type,
        composite=composite,
        trainingData=training_data)


def assemble(year, primitive_collection):
    '''
    Assembles the primitives for a year.
    :param year: The year of the assembly
    :param primitive_collection: ee.ImageCollection of primitives for the year
    :return: ee.Image with land cover layers and ee.Image with class probabilities
    '''
    return landcoverPackage.assemblage(year=year, primitiveCollection=primitive_collection)
