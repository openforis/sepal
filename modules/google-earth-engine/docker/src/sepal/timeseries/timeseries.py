import ee

from ..landsat import LandsatDataSet
from ..mosaic.analyze import analyze
from ..mosaic.clouds import mask_clouds
from ..mosaic.shadows import mask_shadows
from ..sentinel2 import Sentinel2DataSet


class TimeSeries(object):
    def __init__(self, spec):
        super(TimeSeries, self).__init__()
        self.spec = spec
        data_sets = [self._to_data_set(data_set) for data_set in spec.data_sets]
        collection = ee.ImageCollection([])
        for data_set in data_sets:
            data_set_collection = analyze(spec, data_set, data_set.to_collection())
            collection = ee.ImageCollection(collection.merge(data_set_collection))
        collection = ee.ImageCollection(ee.Algorithms.If(
            collection.size(),
            self._process_collection(collection, spec),
            ee.ImageCollection([])
        ))
        self.stack = self._to_stack(collection, spec.aoi)
        self.dates = collection.map(lambda image: ee.Feature(None, {'date': image.get('date')}))

    def _process_collection(self, collection, spec):
        collection = mask_clouds(spec, collection)
        collection = mask_shadows(spec, collection)
        collection = self._to_daily_mosaics(collection)
        return collection

    def _to_stack(self, collection, aoi):
        def append_band(image, resulting_stack):
            return ee.Image(resulting_stack).addBands(
                ee.Image(image).rename([ee.String(image.get('date'))])
            )

        stack = ee.Image(
            collection.iterate(append_band, ee.Image().uint16())
        )
        return stack.slice(1).clip(aoi).uint16()

    def _to_daily_mosaics(self, collection):
        def evaluate_expression(image):
            date = image.date()
            image = image.expression(self.spec.expression, {
                'i': image
            })
            return image.set('date', ee.Date.fromYMD(
                date.get('year'),
                date.get('month'),
                date.get('day')
            ).format('yyyy-MM-dd'))

        collection = collection.map(evaluate_expression)

        def to_mosaic(image):
            return ee.ImageCollection(ee.List(image.get('images'))) \
                .median() \
                .set('date', image.get('date'))

        return ee.ImageCollection(
            ee.Join.saveAll('images').apply(
                primary=ee.ImageCollection(collection.distinct('date')),
                secondary=collection,
                condition=ee.Filter.equals(leftField='date', rightField='date')
            )).map(to_mosaic).sort('date')

    def _to_data_set(self, dataSetName):
        image_filter = ee.Filter.And(
            ee.Filter.geometry(self.spec.aoi),
            ee.Filter.date(self.spec.from_date, self.spec.to_date)
        )
        if dataSetName in ['landsat5', 'landsat7', 'landsat8']:
            return LandsatDataSet.create(dataSetName, image_filter)
        if dataSetName == 'sentinel2':
            return Sentinel2DataSet(image_filter)

        raise Exception('Invalid dataSetName: ' + dataSetName)
