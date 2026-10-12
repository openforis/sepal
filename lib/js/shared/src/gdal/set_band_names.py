import sys

from osgeo import gdal
from osgeo.gdalconst import GA_Update

gdal.UseExceptions()


def set_band_names(path, names):
    ds = gdal.Open(path, GA_Update)
    for i in range(0, len(names)):
        band = ds.GetRasterBand(i + 1)
        band.SetDescription(names[i])
    ds.FlushCache()


if __name__ == '__main__':
    set_band_names(
        path=sys.argv[1],
        names=sys.argv[2:]
    )
