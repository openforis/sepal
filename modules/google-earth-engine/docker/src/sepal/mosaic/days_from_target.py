import ee


def mask_days_from_target(mosaic_def, collection):
    target_day_weight = mosaic_def.target_day_weight
    if not target_day_weight:
        return collection  # If no weight it's pointless to reduce and map the collection

    daysFromTargetPercentile = (1 - target_day_weight) * 100
    daysFromTargetThreshold = collection.select('daysFromTarget') \
        .reduce(ee.Reducer.percentile([daysFromTargetPercentile]))

    return collection.map(
        lambda image: image.updateMask(
            image.select('daysFromTarget').lte(daysFromTargetThreshold)
        ))
