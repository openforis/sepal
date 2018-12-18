import uuid

import ee
import landcoverPackage
from landcoverPackage.assemblage import assemblage
from landcoverPackage.smoothing import whittakerSmoothen

import decision_tree_converter
from .. import drive
from ..aoi import Aoi
from ..export.image_to_asset import ImageToAsset
from ..export.table_to_asset import TableToAsset
from ..gee import create_asset_image_collection, to_asset_id
from ..task.task import ThreadTask, Task


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
        self.band_order = None

    def run(self):
        ee.InitializeThread(self.credentials)
        create_asset_image_collection(to_asset_id(self.asset_path + '/primitives'))
        create_asset_image_collection(to_asset_id(self.asset_path + '/smoothed-primitives'))
        create_asset_image_collection(to_asset_id(self.asset_path + '/assembly'))
        self.drive_folder = drive.create_folder(self.credentials, self.drive_folder_name)
        return self.pipe(
            self._sample,
            self._create_primitives,
            self._smooth,
            self._assemble,
            self.resolve
        )

    def close(self):
        if self.drive_folder:
            drive.delete(self.credentials, self.drive_folder)

    def _sample(self):
        all_training_data = ee.FeatureCollection('ft:' + self.training_data['tableId'])
        all_sampled_data = ee.FeatureCollection([])
        for year in range(self.start_year, self.end_year + 1):
            training_data = all_training_data.filter(ee.Filter.eq(self.training_data['yearColumn'], year)) \
                .map(lambda feature: feature.set('class', feature.get(self.training_data['classColumn'])))
            composite = ee.Image(_composite_asset_id(self.asset_path, year))
            sampled_data = sample(
                composite=composite,
                training_data=training_data
            ).map(lambda feature: ee.Feature(
                ee.Feature(ee.Geometry.Point([0, 0]))
                    .copyProperties(feature)
                    .set('year', year)
            ))
            all_sampled_data = ee.FeatureCollection(
                all_sampled_data.merge(sampled_data).copyProperties(sampled_data)
            )

        self.band_order = all_sampled_data.get('band_order')
        return TableToAsset(
            credentials=self.credentials,
            table=all_sampled_data,
            asset_id=_samples_asset_id(self.asset_path),
            retries=5
        ).submit()

    def _create_primitives(self):
        all_samples = ee.FeatureCollection(_samples_asset_id(self.asset_path))
        primitive_tasks = []
        for primitive_type in self.primitive_types:
            samples = self._primitive_samples(primitive_type, all_samples)
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
        return Task.submit_all(primitive_tasks)

    def _primitive_samples(self, primitive_type, all_samples):
        primitive_class = self.training_data['classByPrimitive'][primitive_type]

        def to_primitive_feature(feature, binary_class):
            year = ee.Number(feature.get('year'))
            return ee.Feature(ee.Geometry.Point([0, 0])) \
                .copyProperties(source=feature, exclude=['year']) \
                .set('class', binary_class) \
                .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())

        # TODO: Exclude training_data where composite is masked
        # For each year, filter based on composite mask, then merge results

        ee_primitive_class = ee.Number(int(primitive_class)) if _is_number(primitive_class) else primitive_class

        with_class = all_samples \
            .filter(ee.Filter.eq('class', ee_primitive_class)) \
            .map(lambda feature: to_primitive_feature(feature, 1))
        with_other_class = all_samples \
            .filter(ee.Filter.neq('class', ee_primitive_class)) \
            .map(lambda feature: to_primitive_feature(feature, 0)) \
            .randomColumn('__random__') \
            .sort('__random__') \
            .limit(with_class.size())
        return ee.FeatureCollection(
            with_class.merge(with_other_class).copyProperties(all_samples)
        ).set('band_order', self.band_order)

    def status_message(self):
        return 'Creating land cover map'  # TODO: More fine grained message

    def _smooth(self):
        tasks = []
        for primitive_type in self.primitive_types:
            primitive_collection = ee.ImageCollection(
                [_primitive_asset_id(self.asset_path, year, primitive_type)
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
                            assetId=_smoothed_primitive_asset_id(self.asset_path, year, primitive_type),
                            scale=self.scale,
                            retries=5
                        )
                    )
                )
        ee.InitializeThread(self.credentials)
        return Task.submit_all(tasks)

    def _assemble(self):
        merged_primitive_collection = ee.ImageCollection([])
        for primitive_type in self.primitive_types:
            primitive_collection = ee.ImageCollection(
                [_smoothed_primitive_asset_id(self.asset_path, year, primitive_type)
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
        assembly = assemble(
            primitive_collection=primitive_collection.filter(year_filter),
            decision_tree=self.decision_tree,
            year=year
        )

        export_assembly = self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=assembly,
                region=self.aoi.bounds(),
                description=None,
                assetId=to_asset_id('{0}/assembly/{1}'.format(self.asset_path, year)),
                scale=self.scale,
                pyramidingPolicy='{"classification": "mode", "confidence": "mean"}',
                retries=5
            ))
        return Task.submit_all([export_assembly])


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
            aoi,
            drive_folder_name
    ):
        super(CreatePrimitive, self).__init__('create_primitive')
        self.credentials = credentials
        self.scale = scale
        self.year = year
        self.primitive_type = primitive_type
        self.samples = samples
        self.asset_path = asset_path
        self.aoi = aoi
        self.composite = ee.Image(_composite_asset_id(asset_path, year))
        self.drive_folder_name = drive_folder_name

    def run(self):
        ee.InitializeThread(self.credentials)
        return self._create_primitive(self.samples).pipe(self.resolve)

    def primitive_asset(self):
        return ee.Image(self.primitive_asset_path())

    def primitive_asset_path(self):
        return _primitive_asset_id(self.asset_path, self.year, self.primitive_type)

    def _create_primitive(self, sampled_data):
        primitive = create_primitive(
            year=self.year,
            type=self.primitive_type,
            composite=self.composite,
            training_data=sampled_data
        ).set('primitive_type', self.primitive_type)
        return self.dependent(
            ImageToAsset(
                credentials=self.credentials,
                image=primitive.clip(self.aoi).uint8(),
                region=self.aoi.bounds(),
                description=None,
                assetId=self.primitive_asset_path(),
                scale=self.scale,
                retries=5
            ))


def _flatten(iterable):
    return [item for sublist in iterable for item in sublist]


def sample(composite, training_data):
    """
    Samples provided composite.
    :param composite: The composite to sample as an ee.Image
    :param training_data: ee.FeatureCollection of training data
    :return: ee.FeatureCollection with sampled data.
    """
    return landcoverPackage.sample(composite=composite, trainingData=training_data)


def create_primitive(year, type, composite, training_data):
    """
    Creates primitive for year of the specified type, based on provided training data.
    :param year: The year to create primitive for
    :param type: The type of primitive to create
    :param composite: The composite to create the primitive for as ee.Image
    :param training_data: ee.FeatureCollection with the classes and sampled properties
    :return: An ee.Image with the primitive with a year property set.
    """
    return ee.Image(100).subtract(ee.Image(ee.Algorithms.If(
        training_data.first(),
        landcoverPackage.primitive(
            year=year,
            primitiveType=type,
            composite=composite,
            trainingData=training_data
        ),
        ee.Image(100)
    ))) \
        .rename(['confidence']) \
        .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())


def add_covariates(composite):
    return landcoverPackage.addCovariates(composite)


def smooth_primitive_collection(primitive_collection):
    smoothed_primitive_collection, rmse = whittakerSmoothen(
        primitive_collection.map(lambda image: image.rename(['Mode']).unmask()))
    smoothed_primitive_collection = smoothed_primitive_collection.map(
        lambda image: image.rename(['confidence']).updateMask(image.gt(0)).uint8()
    )
    return smoothed_primitive_collection, rmse


def assemble(year, primitive_collection, decision_tree):
    """
    Assembles the primitives for a year.
    :param year: The year of the assembly
    :param primitive_collection: ee.ImageCollection of primitives for the year
    :return: ee.Image with land cover and ee.confidence.
    """
    image = assemblage().collectionToImage(primitive_collection)
    node_struct = _to_node_struct(decision_tree)
    classification, confidence = assemblage().createAssemblage(image, node_struct)
    assembly = ee.Image(
        classification
            .addBands(confidence.rename(['confidence']))
            .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
            .uint8()
    )
    return assembly


def _to_node_struct(decision_tree):
    return decision_tree_converter.convert(decision_tree)


def _primitive_asset_id(asset_path, year, primitive_type):
    return to_asset_id('{0}/primitives/{1}-{2}'.format(asset_path, year, primitive_type))


def _smoothed_primitive_asset_id(asset_path, year, primitive_type):
    return to_asset_id('{0}/smoothed-primitives/{1}-{2}'.format(asset_path, year, primitive_type))


def _composite_asset_id(asset_path, year):
    return to_asset_id('{0}/composites/{1}'.format(asset_path, year))


def _samples_asset_id(asset_path):
    return to_asset_id('{0}/samples'.format(asset_path))


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
