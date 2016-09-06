import ee

class Aoi:
    _reference_systems = {'wrs-2': 'ft:1EJjaOloQD5NL7ReC5aVtn8cX05xbdEbZthUiCFB6'}

    def __init__(self, geometry):
        self._geometry = geometry

    @staticmethod
    def create(spec):
        def polygon():
            return ee.Geometry(ee.Geometry.Polygon(coords=[spec['path']]), opt_geodesic=False)

        def fusionTable():
            table = ee.FeatureCollection('ft:' + spec['tableName'])
            aoi = table.filterMetadata(spec['keyColumn'], 'equals', spec['keyValue'])
            return aoi.geometry()

        aoi_type = spec['type']
        if aoi_type not in locals():
            raise ValueError('Unsupported AOI type: ' + aoi_type)
        geometry = locals()[aoi_type]()
        return Aoi(geometry)

    def scene_areas(self, reference_system):
        if reference_system not in self._reference_systems:
            raise ValueError('Unsupported spatial reference system: ' + aoi_type)
        scene_area_table = ee.FeatureCollection(self._reference_systems[reference_system])
        join = ee.Join.saveAll(matchesKey='scenes')
        intersect_joined = join.apply(self._geometry, scene_area_table, ee.Filter.intersects(
            leftField='.geo',
            rightField='.geo',
            maxError=10
        ))
        intersected = intersect_joined.aggregate_array('scenes').getInfo()
        scene_areas = []
        for featureScenes in intersected:
            for sceneArea in featureScenes:
                polygon = map(lambda lnglat: list(reversed(lnglat)), sceneArea['geometry']['coordinates'][0])
                scene_areas.append({
                    'sceneAreaId': sceneArea['properties']['name'],
                    'polygon': polygon,
                })
        return scene_areas

    def geometry(self):
        return self._geometry
