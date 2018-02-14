from glob import glob

import osgeo.gdal
from osgeo.gdalconst import GA_Update

from ..task.task import ThreadTask


class SetBandNames(ThreadTask):
    def __init__(self, band_names, files):
        super(SetBandNames, self).__init__()
        self.band_names = band_names
        self.files = files

    def run(self):
        if isinstance(self.files, basestring):
            files = [self.files]
        else:
            files = self.files
        globbed_files = []
        for f in files:
            globbed_files += glob(f)

        for f in globbed_files:
            if not self.running():
                return
            ds = osgeo.gdal.Open(f, GA_Update)
            for i in range(0, len(self.band_names)):
                if not self.running():
                    return
                band = ds.GetRasterBand(i + 1)
                band.SetMetadata({'BAND_NAME': self.band_names[i]})
        self.resolve()

    def __str__(self):
        return '{0}(band_names={1}, files={2})'.format(
            type(self).__name__, self.band_names, self.files)
