import folium


class EELayer(object):
    def __init__(self, image, viz_params, name=None, center=False, show=True):
        """
        Creates a map layer to be added to a Folium map.

        Args:
            image: The ee.Image to show.

            viz_params: The visualization params to use.

            name: The name of the map layer.

            center: Determines if the map should center the layer or not

            show: Determines if the layer is shown on the map

        Returns:
            The provided map.

        """
        super(EELayer, self).__init__()
        self.image = image
        self.viz_params = viz_params
        self.name = name
        self.center = center
        self.show = show


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


def map_layers(layers):
    """
    Adds an EELayer list to a Folium map.

    Args:
        layers: The EELayers to add to the map.

    Returns:
        A folium.Map instance with the layers added.

    """
    url = "https://earthengine.googleapis.com/map/{mapid}/{{z}}/{{x}}/{{y}}?token={token}"
    map = folium.Map()
    for i, layer in enumerate(layers):
        map_ref = layer.image.getMapId(layer.viz_params)
        folium.TileLayer(
            tiles=url.format(**map_ref),
            name=layer.name if layer.name else 'layer-' + str(i + 1),
            attr='Google Earth Engine',
            overlay=True,
            show=layer.show
        ).add_to(map)
        if layer.center:
            center(map, layer.image)
    folium.map.LayerControl().add_to(map)
    return map
