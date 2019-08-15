from typing import Union

import ee


# noinspection PyUnresolvedReferences
def tile(
        region: Union[ee.Geometry, ee.Feature, ee.FeatureCollection],
        size_in_degrees: Union[int, float]
) -> ee.FeatureCollection:
    def tile_geometry(geometry):
        coords = ee.List(geometry.bounds().coordinates().get(0))
        min_point = ee.List(coords.get(0))
        max_point = ee.List(coords.get(2))

        # noinspection PyUnresolvedReferences
        def sequence(direction):
            start = min_point.get(direction)
            stop = ee.Number(max_point.get(direction))
            return ee.List.sequence(start, stop, size_in_degrees)

        tiles = sequence(0).map(
            lambda x: sequence(1).map(
                lambda y: ee.Feature(ee.Geometry.Rectangle([
                    [ee.Number(x), ee.Number(y)],
                    [
                        ee.Number(x).add(size_in_degrees).min(max_point.get(0)),
                        ee.Number(y).add(size_in_degrees).min(max_point.get(1))
                    ]
                ]).intersection(geometry, 30))
            )
        ).flatten()
        return ee.FeatureCollection(tiles).filterBounds(geometry)

    def tile_feature_collection(feature_collection: ee.FeatureCollection):
        return ee.FeatureCollection(
            feature_collection.iterate(
                lambda feature, acc: ee.FeatureCollection(acc).merge(tile_geometry(ee.Feature(feature).geometry()))
                , ee.FeatureCollection([])
            )
        )
        # return feature_collection.map(lambda f: tile_geometry(f.geometry())).flatten()

    if isinstance(region, ee.FeatureCollection):
        return tile_feature_collection(region)
    elif isinstance(region, ee.Feature):
        return tile_geometry(region.geometry())
    elif isinstance(region, ee.Geometry):
        return tile_geometry(region)
    else:
        raise ValueError(
            'region must be ee.FeatureCollection, ee.Feature, or ee.Geometry. Was {}'.format(type(r))
        )
