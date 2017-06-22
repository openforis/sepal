import logging

import ee

import landsat.best_scenes
import sentinel2.best_scenes


class Aoi:
    _fusion_table_by_data_set = {
        'LANDSAT': {
            'table_id': 'ft:1EJjaOloQD5NL7ReC5aVtn8cX05xbdEbZthUiCFB6',
            'id_column': 'name',
            'coordinates': lambda sceneArea: sceneArea['geometry']['coordinates'][0]
        },
        'SENTINEL2': {
            'table_id': 'ft:1z3OSnCDFQqUHIXlU_hwVc5h4ZrDP2VdQNNfG3RZB',
            'id_column': 'name',
            'coordinates': lambda sceneArea: sceneArea['geometry']['geometries'][1]['coordinates'][0]
        }
    }

    def __init__(self, geometry):
        self._geometry = geometry

    @staticmethod
    def create(spec):
        """Creates an Aoi according to provided specs.

        :param spec: A dict specifying the Aoi
        :type spec: dict

        :return: An Aoi instance
        :rtype: Aoi
        """
        type = {
            'polygon': Polygon,
            'fusionTable': FusionTable,
        }[spec['type']]
        return type(spec)

    def scene_areas(self, data_set):
        """Determines scene areas in the provided reference system this Aoi intersects.

        :param reference_system: The spatial reference system of the scene areas
        :return: A list of dicts scene areas
        :rtype: list
        """
        if data_set not in self._fusion_table_by_data_set:
            raise ValueError('Unsupported data set: ' + data_set)
        table = self._fusion_table_by_data_set[data_set]
        scene_area_table = ee.FeatureCollection(table['table_id']) \
            .filterBounds(self._geometry) \
            .toList(1e6) \
            .getInfo()
        scene_areas = []
        for scene_area in scene_area_table:
            polygon = map(lambda lnglat: list(reversed(lnglat)), table['coordinates'](scene_area))
            scene_areas.append({
                'sceneAreaId': scene_area['properties'][table['id_column']],
                'polygon': polygon,
            })

        return scene_areas

    def geometry(self):
        """Gets the ee.Geometry of this Aoi.
    
        :return: The ee.Geometry
        :rtype: ee.Geometry
        """
        return self._geometry

    def best_scenes(self, data_set, from_date, to_date, target_day_of_year, target_day_of_year_weight):
        logging.info('Determining best scenes of ' + str(self))
        if data_set == 'SENTINEL2':
            return sentinel2.best_scenes.find(self, from_date, to_date, target_day_of_year, target_day_of_year_weight)
        else:
            return landsat.best_scenes.find(self, from_date, to_date, target_day_of_year, target_day_of_year_weight)


class Polygon(Aoi):
    def __init__(self, spec):
        self.path = spec['path']
        geometry = ee.Geometry(ee.Geometry.Polygon(coords=[self.path]), opt_geodesic=False)
        Aoi.__init__(self, geometry)

    def __str__(self):
        return 'Polygon(path: ' + self.path + ')'


class FusionTable(Aoi):
    def __init__(self, spec):
        self.table_name = spec['tableName']
        self.key_column = spec['keyColumn']
        self.value_column = spec['keyValue']
        table = ee.FeatureCollection('ft:' + self.table_name)
        aoi = table.filterMetadata(self.key_column, 'equals', self.value_column)
        geometry = aoi.geometry().buffer(10000)
        Aoi.__init__(self, geometry)

    def __str__(self):
        return 'FusionTable(table_name: ' + self.table_name \
               + ', key_column: ' + self.key_column \
               + ', value_column: ' + self.value_column + ')'
