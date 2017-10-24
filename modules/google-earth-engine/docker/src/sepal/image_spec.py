import logging
import uuid
from abc import abstractmethod

import ee

from download import export
from download.download import Downloader


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

    def download(self, name, username, credentials, destination, downloader):
        """Starts to download the image in the background.

        :param name: The name to assign the downloaded file (excluding .tif)
        :type name: str

        :param username: The username of the user downloading.
        :type username: str

        :param credentials: The Google credenteials
        :type credentials: oauth2client.client.Credentials

        :param downloader: The download to use
        :type downloader: Downloader

        :return: The task id of the download
        :rtype: str
        """
        if destination == 'sepal':
            file_id = 'sepal-' + name + '-' + str(uuid.uuid4())
            task_id = export.to_drive(self._ee_image(), self.aoi.geometry().bounds(), name, username, file_id,
                                      self.scale)
        else:
            file_id = 'sepal'
            task_id = export.to_asset(self._ee_image(), self.aoi.geometry().bounds(), name, username, self.scale)
        downloader.start_download(task_id, name, file_id, self.bands, credentials, destination)
        return task_id

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
