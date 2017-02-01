import logging
import os
from threading import Thread

import osgeo.gdal

logger = logging.getLogger(__name__)


class PostProcess(object):
    def __init__(self, file_name, download_dir, listener):
        self.file_name = file_name
        self.dir = str(download_dir + '/' + self.file_name)
        self.listener = listener
        self.running = True
        self.canceled = False
        self.thread = Thread(
            name='PostProcess-' + self.dir,
            target=self._execute)

    def cancel(self):
        logging.debug('Cancelling post processing of ' + self.dir)
        self.canceled = True
        self.stop()

    def start(self):
        self.thread.start()

    def stop(self):
        if self.running:
            logging.debug('Stopping post processing of ' + self.file_name)
            self.running = False

    def _execute(self):
        try:
            logging.debug('Starting to process: ' + self.dir)
            tifs = ['%s/%s' % (self.dir, file)
                    for file in os.listdir(self.dir) if file.lower().endswith('.tif')]
            logging.debug('Downloaded ' + str(tifs))
            if len(tifs) > 1:
                vrt = '%s/%s.vrt' % (self.dir, self.file_name)
                logging.debug('Building vrt: ' + vrt)
                self.listener.update_status({
                    'state': 'ACTIVE',
                    'step': 'POSTPROCESSING',
                    'description': "Building virtual raster"})

                gdal.BuildVRT(vrt, tifs).FlushCache()
                logging.debug('Starting to process: ' + self.dir)
            self.listener.update_status({
                'state': 'COMPLETED',
                'description': "Completed"})
        except:
            logger.exception('Download from Google Drive failed. Path: ' + self.file_name)
            self.listener.update_status({
                'state': 'FAILED',
                'description': 'Failed to build virtual raster'})
            self.stop()

