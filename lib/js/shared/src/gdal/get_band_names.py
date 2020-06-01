import json
import sys
from osgeo import gdal
from osgeo.gdalconst import GA_ReadOnly


def get_band_names(path):
    ds = gdal.Open(path, GA_ReadOnly)
    metadata = [
        ds.GetRasterBand(i + 1).GetDescription()
        for i in range(0, ds.RasterCount)
    ]
    return metadata


if __name__ == '__main__':
    metadata = get_band_names(
        path=sys.argv[1]
    )
    print(json.dumps(metadata))
