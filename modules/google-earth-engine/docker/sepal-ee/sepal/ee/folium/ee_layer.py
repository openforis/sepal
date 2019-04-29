import folium

def add_to(map, image, viz_params, name):
    """
    Adds an ee.Image to a Folium map.

    Args:

        map: The map the add the image to.

        image: The ee.Image to add to the map.

        viz_params: The visualization params to use.

        name: The name of the map layer.

    Returns:
        The provided map.

    """
    map_ref = image.getMapId(viz_params)
    url = "https://earthengine.googleapis.com/map/{mapid}/{{z}}/{{x}}/{{y}}?token={token}"
    folium.TileLayer(
        tiles=url.format(**map_ref),
        name=name,
        attr='Google Earth Engine',
        overlay=True
    ).add_to(map)
    return map


def center(map, object):
    """
    Center an ee.Image or ee.Feature on the map.

    Args:

        map: The map to center the object on.

        object: The ee.Image or ee.Feature to center.

    Returns:
         The provided map.

    """
    coordinates = object.geometry().bounds().coordinates().getInfo()[0]
    bounds = [[point[1], point[0]] for point in coordinates]
    map.fit_bounds(bounds)
    return map
