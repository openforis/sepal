from typing import Union

from rx import Observable, defer, from_callable
from sepal.gdal import set_band_metadata
from sepal.rx.workqueue import WorkQueue

gdal_queue = WorkQueue(2)


def set_band_names(
        band_names: list,
        files: Union[str, list]
) -> Observable:
    def action():
        set_band_metadata('BAND_NAME', band_names, files)

    return defer(
        lambda _: gdal_queue.enqueue(
            from_callable(action),
            retries=3,
            description='set_band_names({}, {})'.format(band_names, files)
        )
    )
