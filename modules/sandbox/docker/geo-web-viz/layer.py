import mapnik


# noinspection PyUnresolvedReferences
class Layer(object):
    def bounds(self):
        map = mapnik.Map(1, 1, '+init=epsg:4326')
        self.append_to(map)
        map.zoom_all()
        envelope = map.envelope()
        return [[envelope.miny, envelope.minx], [envelope.maxy, envelope.maxx]]

    def features(self, lat, lng):
        map = mapnik.Map(1, 1, '+init=epsg:4326')
        self.append_to(map)
        map.zoom_all()

        if not map.envelope().intersects(lng, lat):
            return []

        return [
            {'id': feature.id(), 'attributes': feature.attributes}
            for feature in map.query_point(0, lng, lat)
            ]
