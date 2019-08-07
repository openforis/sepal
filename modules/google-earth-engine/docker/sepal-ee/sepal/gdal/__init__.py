from glob import glob
from typing import Union

from osgeo import gdal
from osgeo.gdalconst import GA_Update


def set_band_metadata(
        name: str,
        values: list,
        files: Union[str, list]
):
    if isinstance(files, str):
        files_ = [files]
    else:
        files_ = files
    globbed_files = []
    for f in files_:
        globbed_files += glob(f)

    for f in globbed_files:
        ds = gdal.Open(f, GA_Update)
        for i in range(0, len(values)):
            band = ds.GetRasterBand(i + 1)
            band.SetMetadata({name: values[i]})
            ds.FlushCache()
