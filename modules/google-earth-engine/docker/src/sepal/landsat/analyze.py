import ee

from ..image_operation import ImageOperation


class Analyze(ImageOperation):
    def __init__(self, image, bands, mosaic_spec):
        super(Analyze, self).__init__(image)
        self.bands = bands
        self.surface_reflectance = mosaic_spec.surface_reflectance
        self.selected_bands = mosaic_spec.bands
        self.pan_sharpen = mosaic_spec.pan_sharpen if 'pan' in bands and len(self.selected_bands) == 3 else False

    def apply(self):
        bands = self.bands
        if not 'aerosol' in bands:
            self.set('aerosol', 0)
        if not 'cirrus' in bands:
            self.set('cirrus', 0)

        if 'fmask' in bands:
            self.set('toMask', 'i.fmask >= 2')
            self.set('snow', 'i.fmask == 3')
        elif 'pixel_qa' in bands:
            def is_set(types):
                typeByValue = {'water': 4, 'shadow': 8, 'snow': 16, 'cloud': 32}
                any_set = ee.Image(0)
                for type in types:
                    any_set = any_set.Or(self.image.select('pixel_qa').bitwiseAnd(typeByValue[type]).neq(0))
                return any_set

            self.set('toMask', is_set(['cloud', 'shadow']))
            self.set('snow', is_set(['snow']))
        else:
            def is_set(types):
                # https://landsat.usgs.gov/collectionqualityband
                typeByValue = {'badPixels': 15, 'cloud': 16, 'shadow': 256, 'snow': 1024, 'cirrus': 4096}
                any_set = ee.Image(0)
                for type in types:
                    any_set = any_set.Or(self.image.select('BQA').bitwiseAnd(typeByValue[type]).neq(0))
                return any_set

            self.set('toMask', is_set(['badPixels', 'cloud', 'shadow', 'cirrus']))
            self.set('snow', is_set(['snow']))

        if self.surface_reflectance:
            self.setAll(self.image.divide(10000))

        if self.pan_sharpen:
            sharpened = self._pan_sharpen(self.selected_bands)
            self.setAll(sharpened)

        return self.image

    def _pan_sharpen(self, bands):
        hueSat = self.image.select(bands).rgbToHsv().select(['hue', 'saturation'])
        return ee.Image.cat(hueSat, self.image.select('pan')).hsvToRgb() \
            .rename(self.image.select(bands).bandNames())
