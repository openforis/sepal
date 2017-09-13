import ee


def mask_less_green(mosaic_def, collection):
    if not mosaic_def.greenness_weight:
        return collection  # No point of reducing and mapping the collection if we have no greenness weight

    ndvi_threshold = collection.select('ndvi') \
        .reduce(ee.Reducer.percentile([mosaic_def.greenness_weight * 100]))

    return collection.map(
        lambda image: image.updateMask(
            image.select('ndvi').gte(ndvi_threshold)
        ))
