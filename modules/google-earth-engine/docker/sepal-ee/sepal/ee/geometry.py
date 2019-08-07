from typing import Union

import ee


# noinspection PyUnresolvedReferences
def tile(
        geometry: ee.Geometry,
        size_in_degrees: Union[int, float]
) -> ee.FeatureCollection:
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
    return ee.FeatureCollection(tiles)
