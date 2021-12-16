from glob import glob
from typing import Union

from osgeo import gdal
from rx import Observable, defer, from_callable
from sepal.rx.workqueue import WorkQueue

gdal_queue = WorkQueue(2)


def build_vrt(
        destination: str,
        files: Union[str, list]
) -> Observable:
    def action():
        if isinstance(files, str):
            files_ = glob(files)
        else:
            files_ = files
        gdal.SetConfigOption('VRT_SHARED_SOURCE', '0')
        vrt = gdal.BuildVRT(destination, files_)
        if vrt:
            vrt.FlushCache()

    return defer(
        lambda _: gdal_queue.enqueue(
            from_callable(action),
            retries=3,
            description='build_vrt({}, {})'.format(destination, files)
        )
    )
