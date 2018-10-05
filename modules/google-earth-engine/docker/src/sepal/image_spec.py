import logging
from abc import abstractmethod

import ee


class ImageSpec(object):
    def preview(self):
        """Creates Google Earth Engine mapId/token pair for rendering the image.

        :return: A dictionary with mapId and token
        :rtype: dict
        """
        viz_params = self._viz_params()
        ee_image = self._ee_image()
        ee_preview = None
        retry = 0
        while not ee_preview:
            try:
                ee_preview = ee_image.getMapId(viz_params)
            except ee.EEException:
                retry += 1
                if retry > 9:
                    raise
                logging.info('Retry ' + str(retry) + ' of requesting map id of ' + str(self))
        logging.debug('Got map id of ' + str(self) + ': ' + str(ee_preview))
        return {
            'mapId': ee_preview['mapid'],
            'token': ee_preview['token']
        }

    def geometry(self):
        geometry = self.aoi._geometry
        feature = ee.Feature(geometry)
        bounds_polygon = ee.List(geometry.bounds().coordinates().get(0))
        bounds = ee.List([bounds_polygon.get(0), bounds_polygon.get(2)]).getInfo()
        mapId = feature.getMapId({
            'color': '#272723'
        })
        return {
            'mapId': mapId['mapid'],
            'token': mapId['token'],
            'bounds': bounds
        }

    @abstractmethod
    def _ee_image(self):
        """Creates an ee.Image based on the spec.

        :return: An ee.Image
        :rtype: ee.Image
        """
        raise AssertionError('Method in subclass expected to have been invoked')

    @abstractmethod
    def _viz_params(self):
        """Returns the visualization parameters of this image.

        :return: The visualization parameters.
        :rtype: dict
        """
        raise AssertionError('Method in subclass expected to have been invoked')
