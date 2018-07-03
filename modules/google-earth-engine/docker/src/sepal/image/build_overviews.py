from glob import glob

import osgeo.gdal

from ..task.task import ThreadTask


class BuildOverviews(ThreadTask):
    def __init__(self, files):
        super(BuildOverviews, self).__init__()
        self.files = files

    def run(self):
        if isinstance(self.files, basestring):
            files = glob(self.files)
        else:
            files = self.files

        for f in files:
            ds = osgeo.gdal.OpenShared(f)
            ds.BuildOverviews(resampling='average', overviewlist=[2, 4, 8])
            ds.FlushCache()
        self.resolve()

    def __str__(self):
        return '{0}(files={1})'.format(
            type(self).__name__, self.files)

