import ee
from sepal.ee.rx.export import export_image_to_asset

from .. import image_spec_factory


def create(spec, context):
    credentials = context.credentials
    ee.InitializeThread(credentials)
    image_spec = image_spec_factory.create(context.sepal_api, spec['image'])
    return export_image_to_asset(
        credentials=credentials,
        description=spec['description'],
        image=image_spec._ee_image(),
        pyramiding_policy=image_spec.pyramiding_policy,
        dimensions=None,
        scale=image_spec.scale,
        crs='EPSG:4326',
        max_pixels=1e12
    )
