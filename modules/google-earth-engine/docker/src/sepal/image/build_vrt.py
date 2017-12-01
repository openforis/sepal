from glob import glob

import osgeo.gdal

from ..task.task import ProcessTask


class BuildVrt(ProcessTask):
    def __init__(self, output_file, files):
        super(BuildVrt, self).__init__()
        self.output_file = output_file
        self.files = files

    def run(self):
        if isinstance(self.files, basestring):
            files = glob(self.files)
        else:
            files = self.files
        osgeo.gdal.BuildVRT(self.output_file, files).FlushCache()
        self.resolve()

    def __str__(self):
        return '{0}(output_file={1}, files={2})'.format(
            type(self).__name__, self.output_file, self.files)
