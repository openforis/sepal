import uuid

import ee
import landcoverPackage
import decision_tree_converter
from landcoverPackage.smoothing import whittakerSmoothen
from landcoverPackage.assemblage import assemblage
from promise import Promise

from .. import drive
from ..aoi import Aoi
from ..export.image_to_asset import ImageToAsset
from ..task.task import ThreadTask, Task
import traceback


def create(spec, context):
    return CreateLandCoverMap(context.credentials, spec)


class CreateLandCoverMap(ThreadTask):
    def __init__(self, credentials, spec):
        super(CreateLandCoverMap, self).__init__('create_land_cover_map')
        self.credentials = credentials
        self.asset_path = spec['assetPath']
        self.primitive_types = spec['primitiveTypes']
        self.decision_tree = spec['decisionTree']
        self.start_year = spec['startYear']
        self.end_year = spec['endYear']
        self.training_data = spec['trainingData']
        self.aoi = Aoi.create(spec['aoi']).geometry()
        self.scale = spec['scale']
        self.drive_folder = None
        self.drive_folder_name = '_'.join(['Sepal', self.asset_path.split('/')[-1], str(uuid.uuid4())])
        self.primitive_tasks = None

    def run(self):
        ee.InitializeThread(self.credentials)
        self.drive_folder = drive.create_folder(self.credentials, self.drive_folder_name)
        self.primitive_tasks = self._create_primitive_tasks()
        return Task.submit_all(self.primitive_tasks) \
            .then(self._smooth, self.reject) \
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
                        drive_folder_name=self.drive_folder_name,
                        aoi=self.aoi
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
            composite = ee.Image(_composite_asset_path(self.asset_path, year))
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

        ee_primitive_class = ee.Number(int(primitive_class)) if _is_number(primitive_class) else primitive_class
        with_class = training_data_collection \
            .filter(ee.Filter.eq(class_column, ee_primitive_class)) \
            .map(lambda feature: to_primitive_feature(feature, 1))
        with_other_class = training_data_collection.filter(ee.Filter.neq(class_column, ee_primitive_class)) \
            .map(lambda feature: to_primitive_feature(feature, 0)) \
            .randomColumn('__random__') \
            .sort('__random__') \
            .limit(with_class.size())
        return ee.FeatureCollection(
            with_class.merge(with_other_class)
                .copyProperties(training_data_collection)
        )

    def status_message(self):
        return 'Creating land cover map'  # TODO: More fine grained message

    def _smooth(self, value):
        tasks = []
        for primitive_type in self.primitive_types:
            primitive_collection = ee.ImageCollection(
                [_primitive_asset_path(self.asset_path, year, primitive_type)
                 for year in range(self.start_year, self.end_year + 1)]
            )
            smoothed_primitive_collection, rmse = smooth_primitive_collection(primitive_collection)
            for year in range(self.start_year, self.end_year + 1):
                smoothed_primitive = ee.Image(
                    smoothed_primitive_collection.filterDate(
                        ee.Date.fromYMD(year, 1, 1),
                        ee.Date.fromYMD(year + 1, 1, 1)
                    ).first()
                )
                tasks.append(
                    self.dependent(
                        ImageToAsset(
                            credentials=self.credentials,
                            image=smoothed_primitive,
                            region=self.aoi.bounds(),
                            description=None,
                            assetId=_to_asset_id('{0}/{1}-{2}-smoothed'.format(self.asset_path, year, primitive_type)),
                            scale=self.scale,
                            retries=3
                        )
                    )
                )
        ee.InitializeThread(self.credentials)
        return Task.submit_all(tasks)

    def _assemble(self, value):
        merged_primitive_collection = ee.ImageCollection([])
        for primitive_type in self.primitive_types:
            primitive_collection = ee.ImageCollection(
                [_smoothed_primitive_asset_path(self.asset_path, year, primitive_type)
                 for year in range(self.start_year, self.end_year + 1)]
            )
            primitive_collection = primitive_collection.map(lambda primitive: primitive.rename([primitive_type]))
            merged_primitive_collection = merged_primitive_collection.merge(primitive_collection)

        tasks = []
        for year in range(self.start_year, self.end_year + 1):
            year = int(year)
            export_assembly = self._assemble_year(
                year,
                merged_primitive_collection
            )
            tasks.append(export_assembly)
        return Task.submit_all(tasks)

    def _assemble_year(self, year, primitive_collection):
        year_filter = ee.Filter.date(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year + 1, 1, 1))
        try:
            assembly, probabilities = assemble(
                year=year,
                primitive_collection=primitive_collection.filter(year_filter),
                decision_tree=self.decision_tree
            )
        except:
            traceback.print_exc()
            raise

        export_assembly = self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=assembly,
                region=self.aoi.bounds(),
                description=None,
                assetId=_to_asset_id('{0}/{1}-assembly'.format(self.asset_path, year)),
                scale=self.scale,
                pyramidingPolicy={'classification': 'mode'},
                retries=3
            ))
        export_probabilities = self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=probabilities,
                region=self.aoi.bounds(),
                description=None,
                assetId=_to_asset_id('{0}/{1}-probabilities'.format(self.asset_path, year)),
                scale=self.scale,
                retries=3
            ))
        return Task.submit_all([export_assembly, export_probabilities])


def __str__(self):
    return '{0}()'.format(
        type(self).__name__
    )


class SmoothPrimitives(ThreadTask):
    def __init__(
            self,
            credentials,
            start_year,
            end_year,
            primitive_types,
            aoi,
            scale,
            asset_path
    ):
        super(SmoothPrimitives, self).__init__('smooth_primitives')
        self.credentials = credentials
        self.scale = scale
        self.start_year = start_year
        self.end_year = end_year
        self.primitive_types = primitive_types
        self.asset_path = asset_path
        self.aoi = aoi

    def run(self):
        tasks = []
        for primitive_type in self.primitive_types:
            primitive_collection = ee.ImageCollection([])
            for year in range(self.start_year, self.end_year + 1):
                primitive = ee.Image(_primitive_asset_path(self.asset_path, year, primitive_type))
                primitive_collection = primitive_collection.merge(ee.ImageCollection([primitive]))

            smoothed_primitive_collection, rmse = smooth_primitive_collection(primitive_collection)
            tasks.append(
                self.export_smoothed(smoothed_primitive_collection)
            )
        ee.InitializeThread(self.credentials)
        return Task.submit_all(tasks) \
            .then(self._assemble, self.reject) \
            .then(self.resolve, self.reject)

    # def export_smoothed(self, smoothed_primitive):


class CreatePrimitive(ThreadTask):
    def __init__(
            self,
            credentials,
            scale,
            year,
            asset_path,
            primitive_type,
            samples,
            aoi,
            drive_folder_name
    ):
        super(CreatePrimitive, self).__init__('create_primitive')
        self.credentials = credentials
        self.scale = scale
        self.year = year
        self.primitive_name = primitive_type
        self.samples = samples
        self.asset_path = asset_path
        self.aoi = aoi
        self.composite = ee.Image(_composite_asset_path(asset_path, year))
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
        return ee.Image(self.primitive_asset_path())

    def primitive_asset_path(self):
        return _primitive_asset_path(self.asset_path, self.year, self.primitive_name)

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
                image=primitive.clip(self.aoi).uint8(),
                region=self.aoi.bounds(),
                description=None,
                assetId=self.primitive_asset_path(),
                scale=self.scale,
                retries=3
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
    return ee.Image(ee.Algorithms.If(
        training_data.first(),
        landcoverPackage.primitive(
            year=year,
            primitiveType=type,
            composite=composite,
            trainingData=training_data).rename(['Mode']) \
            .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis()) \
            .set('year', year),
        ee.Image(0)
    ))


def add_covariates(composite):
    return landcoverPackage.addCovariates(composite)


def smooth_primitive_collection(primitive_collection):
    return whittakerSmoothen(primitive_collection)


def assemble(year, primitive_collection, decision_tree):
    '''
    Assembles the primitives for a year.
    :param year: The year of the assembly
    :param primitive_collection: ee.ImageCollection of primitives for the year
    :return: ee.Image with land cover layers and ee.Image with class probabilities
    '''
    image = assemblage().collectionToImage(primitive_collection)
    nodeStruct = _to_node_struct(decision_tree)
    print(decision_tree)
    print(nodeStruct)
    return assemblage().createAssemblage(image, nodeStruct)


def _to_node_struct(decision_tree):
    return decision_tree_converter.convert(decision_tree)


def _primitive_asset_path(asset_path, year, primitive_type):
    return _to_asset_id('{0}/{1}-{2}'.format(asset_path, year, primitive_type))


def _smoothed_primitive_asset_path(asset_path, year, primitive_type):
    return _to_asset_id('{0}/{1}-{2}-smoothed'.format(asset_path, year, primitive_type))


def _composite_asset_path(asset_path, year):
    return _to_asset_id('{0}/{1}-composite'.format(asset_path, year))


def _is_number(s):
    try:
        float(s)
        return True
    except ValueError:
        pass

    try:
        import unicodedata
        unicodedata.numeric(s)
        return True
    except (TypeError, ValueError):
        pass

    return False
