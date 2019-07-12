from glob import glob
from typing import Union

from osgeo import gdal
from osgeo.gdalconst import GA_Update
from rx import from_callable, Observable
from sepal.rx.workqueue import WorkQueue

gdal_queue = WorkQueue(2)


def set_band_names(
        band_names: list,
        files: Union[str, list]
) -> Observable:
    def action():
        if isinstance(files, str):
            files_ = [files]
        else:
            files_ = files
        globbed_files = []
        for f in files_:
            globbed_files += glob(f)

        for f in globbed_files:
            ds = gdal.Open(f, GA_Update)
            for i in range(0, len(band_names)):
                band = ds.GetRasterBand(i + 1)
                band.SetMetadata({'BAND_NAME': band_names[i]})
                ds.FlushCache()

    return gdal_queue.enqueue(
        from_callable(action),
        retries=3,
        description='set_band_names({}, {})'.format(band_names, files)
    )
