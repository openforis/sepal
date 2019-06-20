import logging
from abc import abstractmethod
from gee import get_info
from sepal.ee.image import convert

import ee


class ImageSpec(object):
    def __init__(self):
        super(ImageSpec, self).__init__()
        self.pyramiding_policy = None

    def preview(self):
        """Creates Google Earth Engine mapId/token pair for rendering the image.

        :return: A dictionary with mapId and token
        :rtype: dict
        """
        ee_image = self._ee_image()
        viz_params = self._viz_params()

        if viz_params.get('hsv'):
            ee_image = convert.hsv_to_rgb(ee_image, viz_params)
            viz_params = {} # viz_params have been used to create a rgb image
        ee_preview = None
        retry = 0
        while not ee_preview:
            try:
                ee_preview = ee_image.getMapId(viz_params)
            except ee.EEException:
                retry += 1
                if retry > 3:
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
        bounds = get_info(ee.List([bounds_polygon.get(0), bounds_polygon.get(2)]))
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
