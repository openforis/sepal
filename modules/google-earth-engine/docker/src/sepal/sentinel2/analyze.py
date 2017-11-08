from ..image_operation import ImageOperation


class Analyze(ImageOperation):
    def __init__(self, image, bands):
        super(Analyze, self).__init__(image)
        self.bands = bands

    def apply(self):
        self._mask_if_any_band_is_masked()
        self.setAll(self.image.divide(10000))
        return self.image

    def _mask_if_any_band_is_masked(self):
        for band in list(self.bands.keys()):
            isMasked = self.toImage(band).mask().reduce('min').eq(0)
            self.updateMask(isMasked.Not())
