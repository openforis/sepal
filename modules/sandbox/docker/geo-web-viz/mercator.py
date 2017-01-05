import mapnik
import math


class SphericalMercator(object):
    """Spherical Mercator Projection.

    From from:
      https://github.com/springmeyer/tilelite/blob/master/tilelite.py
    """
    MERC_PROJ4 = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs +over"
    MERC_ELEMENTS = dict([p.split('=') for p in MERC_PROJ4.split() if '=' in p])

    def __init__(self, levels=18, size=256):
        self.Bc = []
        self.Cc = []
        self.zc = []
        self.Ac = []
        self.levels = levels
        self.DEG_TO_RAD = math.pi / 180
        self.RAD_TO_DEG = 180 / math.pi
        self.size = size

        self.mercator = mapnik.Projection(self.MERC_PROJ4)
        for d in range(0, levels):
            e = size / 2.0
            self.Bc.append(size / 360.0)
            self.Cc.append(size / (2.0 * math.pi))
            self.zc.append((e, e))
            self.Ac.append(size)
            size *= 2.0

    @classmethod
    def minmax(a, b, c):
        a = max(a, b)
        a = min(a, c)
        return a

    def ll_to_px(self, px, zoom):
        d = self.zc[zoom]
        e = round(d[0] + px[0] * self.Bc[zoom])
        f = self.minmax(math.sin(self.DEG_TO_RAD * px[1]), -0.9999, 0.9999)
        g = round(d[1] + 0.5 * math.log((1 + f) / (1 - f)) * -self.Cc[zoom])
        return (e, g)

    def px_to_ll(self, px, zoom):
        """Convert pixel postion to LatLong (EPSG:4326)"""
        # TODO - more graceful handling of indexing error
        e = self.zc[zoom]
        f = (px[0] - e[0]) / self.Bc[zoom]
        g = (px[1] - e[1]) / -self.Cc[zoom]
        h = self.RAD_TO_DEG * (2 * math.atan(math.exp(g)) - 0.5 * math.pi)
        return (f, h)

    def xyz_to_envelope(self, x, y, zoom, tms_style=False, count=1):
        """Convert XYZ to mapnik.Box2d"""
        # flip y to match TMS spec
        tms_style = True
        if tms_style:
            y = (2 ** zoom - 1) - y
        ll = (x * self.size, (y + count) * self.size)
        ur = ((x + count) * self.size, y * self.size)
        minx, miny = self.px_to_ll(ll, zoom)
        maxx, maxy = self.px_to_ll(ur, zoom)
        lonlat_bbox = mapnik.Box2d(minx, miny, maxx, maxy)
        env = self.mercator.forward(lonlat_bbox)
        return env

    def is_merc(self, srs):
        srs = srs.lower()
        if 'epsg:900913' in srs:
            return True
        elif 'epsg:3857' in srs:
            return True
        elif not 'merc' in srs:
            return False
        # strip optional modifiers (those without =)
        elements = dict([p.split('=') for p in srs.split() if '=' in p])
        for p in elements:
            if self.MERC_ELEMENTS.get(p, None) != elements.get(p, None):
                return False
        return True
