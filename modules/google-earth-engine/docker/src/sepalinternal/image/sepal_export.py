import ee
from sepal.ee.rx.retrieve.image_to_sepal import image_to_sepal

from .. import image_spec_factory


def create(spec, context):
    credentials = context.credentials
    ee.InitializeThread(credentials)
    image_spec = image_spec_factory.create(context.sepal_api, spec['image'])
    return image_to_sepal(
        credentials,
        description=spec['description'],
        download_dir=context.download_dir,
        image=image_spec._ee_image(),
        dimensions=None,
        scale=image_spec.scale,
        crs='EPSG:4326',
        max_pixels=1e12,
        shard_size=256,
        file_dimensions=4096
    )
