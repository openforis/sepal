from collections import namedtuple

import ee
from sepal.ee.dates import to_ee_date
from sepal.ee.image import replace
from sepal.ee.optical import optical_indexes
from sepal.ee.rx.retrieve.time_series_to_sepal import time_series_to_sepal

from ..aoi import Aoi
from ..landsat import landsat_data_sets
from ..mosaic.analyze import analyze
from ..mosaic.clouds import mask_clouds
from ..mosaic.shadows import mask_shadows


def create(spec, context):
    def get_region():
        aoi_spec = spec['aoi']
        if aoi_spec['type'] == 'FUSION_TABLE':
            if aoi_spec.get('keyColumn'):
                return Aoi.create(aoi_spec).feature_collection
            else:
                return ee.FeatureCollection('ft:' + aoi_spec['id'])
        else:
            return Aoi.create(aoi_spec).geometry()

    def image_collection_factory(geometry, start_date, end_date):
        LandsatSpec = namedtuple(
            'LandsatSpec',
            'credentials, surface_reflectance, shadow_tolerance, '
            'mask_clouds, mask_snow, brdf_correct, target_day, masked_on_analysis, bands, calibrate, cloud_buffer'
        )

        def _process_collection(collection, landsat_spec):
            collection = mask_clouds(landsat_spec, collection)
            collection = mask_shadows(landsat_spec, collection)
            return collection

        landsat_spec = LandsatSpec(
            credentials=credentials,
            surface_reflectance=spec['surfaceReflectance'],
            shadow_tolerance=1,
            mask_clouds=True,
            mask_snow=spec['maskSnow'],
            brdf_correct=spec['brdfCorrect'],
            target_day=0,
            masked_on_analysis=False,
            bands=[],
            calibrate=False,
            cloud_buffer=0
        )

        def calculate_indicator(image):
            return replace(
                image,
                optical_indexes.to_index(image, spec['indicator']).multiply(10000).int16()
            )

        date_filter = ee.Filter.date(to_ee_date(start_date), to_ee_date(end_date))
        data_sets = landsat_data_sets(spec['dataSets'], geometry, landsat_spec, date_filter)
        collection = ee.ImageCollection([])
        for data_set in data_sets:
            data_set_collection = analyze(landsat_spec, data_set, data_set.to_collection())
            collection = ee.ImageCollection(collection.merge(data_set_collection))

        return _process_collection(collection, landsat_spec) \
            .map(calculate_indicator)

    credentials = context.credentials
    ee.InitializeThread(credentials)
    return time_series_to_sepal(
        credentials,
        description=spec['description'],
        download_dir=context.download_dir,
        image_collection_factory=image_collection_factory,
        start_date=spec['fromDate'],
        end_date=spec['toDate'],
        region=get_region(),
        scale=spec.get('scale', 30),
        crs='EPSG:4326',
        max_pixels=1e12,
        shard_size=16,
        file_dimensions=512,
        nodata_value=0,
        retries=2
    )
