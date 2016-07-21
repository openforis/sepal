import ee


def to_drive(image, region, name):
    """
    Exports an image to Google Drive.

    Scenes from the specified sensors, within the area of interest, between the from and to dates will be used.
    The warmest, wettest pixels, close to the specified target day of year, from scenes with low cloud cover
    will be selected in the composite.

    :param image: The image to export.
    :type image: ee.Image

    :param region: The region to export.
    :type region: ee.Geometry

    :return: An export batch job
         """
    task = ee.batch.Export.image.toDrive(
        image=image,
        description=name,
        scale=30,
        region=region.bounds().getInfo()['coordinates']
    )
    task.start()
    # TODO: Set max pixels

    # TODO: If there already is a task with same description?
    #   Put each export into a folder - UUID?
    #   Don't allow it, because they could/would overwrite each other on disk anyway?
    return task.status()['id']
