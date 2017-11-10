import ee

from ..image_operation import ImageOperation


class Analyze(ImageOperation):
    def __init__(self, image, bands):
        super(Analyze, self).__init__(image)
        self.bands = bands

    def apply(self):
        bands = self.bands
        if not 'aerosol' in bands:
            self.set('aerosol', 0)
        if not 'cirrus' in bands:
            self.set('cirrus', 0)

        # if 'fmask' in bands:
        #     self.updateMask('i.fmask < 2')
        #     self.set('snow', 'i.fmask == 3')
        # else:
            def is_set(types):
                # https://landsat.usgs.gov/collectionqualityband
                typeByValue = {'badPixels': 15, 'cloud': 16, 'shadow': 256, 'snow': 1024, 'cirrus': 4096}
                any_set = ee.Image(0)
                for type in types:
                    any_set = any_set.Or(self.image.select('BQA').bitwiseAnd(typeByValue[type]).neq(0))
                return any_set

            self.updateMask(is_set(['badPixels']).Not())

        return self.image
