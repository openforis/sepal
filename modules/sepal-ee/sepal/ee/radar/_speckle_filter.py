import math

import ee


def apply(image, bands, ksize=3, enl=7):
    def to_natural(db):
        return ee.Image(10.0).pow(db.divide(10.0))

    def to_db(natural):
        return ee.Image(natural).log10().multiply(10.0)

    def apply_to_band(band):
        natural = to_natural(image.select(band))

        # Square kernel, ksize should be odd (typically 3, 5 or 7)
        weights = ee.List.repeat(ee.List.repeat(1, ksize), ksize)
        kernel = ee.Kernel.fixed(ksize, ksize, weights, int(ksize / 2), int(ksize / 2), False)

        # Get mean and variance
        mean = natural.reduceNeighborhood(ee.Reducer.mean(), kernel)
        variance = natural.reduceNeighborhood(ee.Reducer.variance(), kernel)

        # "Pure speckle" threshold
        ci = variance.sqrt().divide(mean)  # square root of inverse of enl

        # If ci <= cu, the kernel lies in a "pure speckle" area -> return simple mean
        cu = 1.0 / math.sqrt(enl)

        # If cu < ci < cmax the kernel lies in the low textured speckle area
        # -> return the filtered value
        cmax = math.sqrt(2.0) * cu

        alpha = ee.Image(1.0 + cu * cu).divide(ci.multiply(ci).subtract(cu * cu))
        b = alpha.subtract(enl + 1.0)
        d = mean.multiply(mean).multiply(b).multiply(b).add(
            alpha.multiply(mean).multiply(natural).multiply(4.0 * enl))
        f = b.multiply(mean).add(d.sqrt()).divide(alpha.multiply(2.0))

        # If ci > cmax do not filter at all (i.e. we don't do anything, other then masking)

        # Compose a 3 band image with the mean filtered "pure speckle",
        # the "low textured" filtered and the unfiltered portions
        out = ee.Image.cat(
            to_db(mean.updateMask(ci.lte(cu))),
            to_db(f.updateMask(ci.gt(cu)).updateMask(ci.lt(cmax))), image.updateMask(ci.gte(cmax))
        )

        return out.reduce(ee.Reducer.sum()).rename(band)

    filtered = [apply_to_band(band) for band in bands]
    return image.addBands(filtered, None, True)
