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
    # TODO: Find a good max pixel size
    return task_id
