import mapnik


# noinspection PyUnresolvedReferences
class Layer(object):
    def bounds(self):
        map = mapnik.Map(1, 1, '+init=epsg:4326')
        self.append_to(map)
        map.zoom_all()
        envelope = map.envelope()
        return [[envelope.miny, envelope.minx], [envelope.maxy, envelope.maxx]]

    def layer_features(self, layer_index, lat, lng):
        map = mapnik.Map(1, 1, '+init=epsg:4326')
        self.append_to(map)
        map.zoom_all()
        if not map.envelope().intersects(lng, lat):
            return []
        return [
            feature.attributes
            for feature in map.query_point(layer_index, lng, lat)
            ]
