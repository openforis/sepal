import logging

import ee


def to_drive(image, region, name, username, file_id, scale):
    """
    Exports an image to Google Drive.

    Scenes from the specified sensors, within the area of interest, between the from and to dates will be used.
    The warmest, wettest pixels, close to the specified target day of year, from scenes with low cloud cover
    will be selected in the composite.

    :param image: The image to export.
    :type image: ee.Image

    :param region: The region to export.
    :type region: ee.Geometry

    :param name: The name of the exported file.
    :type name: str

    :param username: The user exporting.
    :type name: str

    :return: An export batch job
    :rtype: str
         """
    logging.info('[' + username + '] Exporting ' + name + ' to drive')
    task = ee.batch.Export.image.toDrive(
        image=image,
        description=name,
        folder=file_id,
        scale=scale,
        maxPixels=1e12,
        region=region.bounds().getInfo()['coordinates'],
        shardSize=256, fileDimensions=4096
    )
    task.start()
    task_id = task.status()['id']
    logging.info('[' + username + '] Task id of ' + name + ':' + task_id)
    return task_id


def to_asset(image, region, name, username, scale):
    """
    Exports an image to Google Earth Engine Asset.

    Scenes from the specified sensors, within the area of interest, between the from and to dates will be used.
    The warmest, wettest pixels, close to the specified target day of year, from scenes with low cloud cover
    will be selected in the composite.

    :param image: The image to export.
    :type image: ee.Image

    :param region: The region to export.
    :type region: ee.Geometry

    :param name: The name of the exported file.
    :type name: str

    :param username: The user exporting.
    :type name: str

    :return: An export batch job
    :rtype: str
         """
    asset_roots = ee.data.getAssetRoots()
    if not asset_roots:
        raise Exception('User ' + username + ' has no GEE asset roots')
    asset_id = asset_roots[0]['id'] + '/' + name
    logging.info('[' + username + '] Exporting ' + name + ' as Google Earth Engine Asset ' + asset_id)
    logging.info(asset_roots)
    task = ee.batch.Export.image.toAsset(
        image=image,
        description=name,
        assetId=asset_id,
        scale=scale,
        maxPixels=1e12,
        region=region.bounds().getInfo()['coordinates']
    )
    task.start()
    task_id = task.status()['id']
    logging.info('[' + username + '] Task id of ' + name + ':' + task_id)
    return task_id
