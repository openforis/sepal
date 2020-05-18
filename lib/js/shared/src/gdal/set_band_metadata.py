import sys
from glob import glob

from osgeo import gdal
from osgeo.gdalconst import GA_Update


def set_band_metadata(path, name, values):
    for f in glob(path):
        ds = gdal.Open(f, GA_Update)
        for i in range(0, len(values)):
            band = ds.GetRasterBand(i + 1)
            band.SetMetadata({name: values[i]})
            ds.FlushCache()


if __name__ == '__main__':
    set_band_metadata(
        path=sys.argv[1],
        name=sys.argv[2],
        values=sys.argv[3:]
    )
