import ee
from rx import concat, of
from rx.operators import flat_map
from sepal.rx.workqueue import WorkQueue

from .asset import delete_asset
from .observables import enqueue, execute
from .task import execute_task


def export_image_to_asset(
        image: ee.Image,
        description: str = None,
        asset_id: str = None,
        pyramiding_policy: dict = None,
        dimensions=None,
        region: ee.Geometry = None,
        scale: int = None,
        crs: str = None,
        crs_transform: str = None,
        max_pixels: int = None,
        retries: int = 3
):
    asset_id, description = _init_asset_id_and_description(asset_id, description)

    def create_task():
        return ee.batch.Export.image.toAsset(
            image=image,
            description=description,
            assetId=asset_id,
            pyramidingPolicy=pyramiding_policy,
            dimensions=dimensions,
            region=region,
            scale=scale,
            crs=crs,
            crsTransform=crs_transform,
            maxPixels=max_pixels
        )

    return _export_to_asset(
        create_task=create_task,
        task_description='export_image_to_asset(asset_id={}, description={}'.format(asset_id, description),
        retries=retries
    )


def export_table_to_asset(
        collection: ee.FeatureCollection,
        description: str = None,
        asset_id: str = None,
        retries: int = 3
):
    asset_id, description = _init_asset_id_and_description(asset_id, description)

    def create_task():
        return ee.batch.Export.table.toAsset(
            collection=collection,
            description=description,
            assetId=asset_id
        )

    return _export_to_asset(
        create_task=create_task,
        task_description='export_table_to_asset(asset_id={}, description={}'.format(asset_id, description),
        retries=retries
    )


def export_image_to_drive(
        image: ee.Image,
        description: str,
        folder: str = None,
        file_name_prefix: str = None,
        dimensions=None,
        region: ee.Geometry = None,
        scale: int = None,
        crs: str = None,
        crs_transform: str = None,
        max_pixels: int = None,
        shard_size: int = None,
        file_dimensions=None,
        skip_empty_tiles=None,
        file_format: str = None,
        format_options: str = None,
        retries: int = 0
):
    def create_task():
        return ee.batch.Export.image.toDrive(
            image=image,
            description=description,
            fileNamePrefix=file_name_prefix,
            dimensions=dimensions,
            region=region,
            scale=scale,
            crs=crs,
            crsTransform=crs_transform,
            maxPixels=max_pixels,
            shardSize=shard_size,
            fileDimensions=file_dimensions,
            skipEmptyTiles=skip_empty_tiles,
            fileFormat=file_format,
            formatOptions=format_options
        )

    return _export_to_drive(
        create_task=create_task,
        task_description='export_table_to_drive(description={}, folder={}, fileNamePrefix={}'.format(
            description, folder, file_name_prefix
        ),
        retries=retries
    )


def export_table_to_drive(
        collection: ee.FeatureCollection,
        description: str = None,
        folder: str = None,
        file_name_prefix: str = None,
        file_format: str = None,
        selectors=None,
        retries: int = 3
):
    def create_task():
        return ee.batch.Export.table.toDrive(
            collection=collection,
            description=description,
            folder=folder,
            fileNamePrefix=file_name_prefix,
            fileFormat=file_format,
            selectors=selectors
        )

    return _export_to_drive(
        create_task=create_task,
        task_description='export_table_to_drive(description={}, folder={}, fileNamePrefix={}'.format(
            description, folder, file_name_prefix
        ),
        retries=retries
    )


def _init_asset_id_and_description(asset_id, description):
    if asset_id and not description:
        i = asset_id.rfind('/')
        description = asset_id[i + 1:]
    elif description and not asset_id:
        asset_id = '{}/{}'.format(_first_asset_root(), description)
    elif not asset_id and not description:
        raise ValueError('asset_id or description must be specified when exporting asset')
    return asset_id, description


def _first_asset_root():
    asset_roots = ee.data.getAssetRoots()
    if not asset_roots:
        raise Exception('User has no GEE asset roots: {}'.format(ee.Credentials()))
    return asset_roots[0]['id']


def _export_to_asset(create_task, task_description, retries):
    action = lambda: execute(create_task).pipe(
        flat_map(lambda task: delete_asset(task.config['assetId']).pipe(
            flat_map(lambda _: execute_task(task))
        ))
    )
    return _export(
        action=action,
        description=task_description,
        retries=retries
    )


def _export_to_drive(create_task, task_description, retries):
    return _export(
        action=lambda: execute_task(create_task()),
        description=task_description,
        retries=retries
    )


# Work (i.e. exports) is grouped by credentials, limiting concurrent exports per credentials
_ee_exports = WorkQueue(
    concurrency_per_group=2,
    description='earth-engine-exports'
)


def _export(action, description, retries):
    return concat(
        of('PENDING'),
        enqueue(
            queue=_ee_exports,
            action=action,
            description=description,
            retries=retries
        )
    )
