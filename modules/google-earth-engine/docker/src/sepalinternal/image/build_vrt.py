from glob import glob

from osgeo import gdal

from ..task.task import ThreadTask


class BuildVrt(ThreadTask):
    def __init__(self, output_file, files):
        super(BuildVrt, self).__init__(retries=3)
        self.output_file = output_file
        self.files = files

    def run(self):
        if isinstance(self.files, basestring):
            files = glob(self.files)
        else:
            files = self.files
        gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
        vrt = gdal.BuildVRT(self.output_file, files)
        if vrt:
            vrt.FlushCache()
        self.resolve()

    def __str__(self):
        return '{0}(output_file={1}, files={2})'.format(
            type(self).__name__, self.output_file, self.files)
