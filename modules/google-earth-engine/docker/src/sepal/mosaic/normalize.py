import ee

from ..image_operation import ImageOperation


class Normalize(ImageOperation):
    def __init__(self, image):
        super(Normalize, self).__init__(image)

    def apply(self, bands, targetDay, normalizer):
        self.image = self.image.select(list(bands.values()), list(bands.keys()))
        if normalizer:
            self.image = self.image.addBands(normalizer(self.image), None, True)

        date = self.image.date()
        self.set('dayOfYear',
                 date.getRelative('day', 'year'))

        self.set('daysFromTarget',
                 'abs(i.dayOfYear - {targetDay})',
                 {'targetDay': targetDay})
        self.setIf('daysFromTarget',
                   'i.daysFromTarget < i.daysFromTarget - 365',
                   'i.daysFromTarget - 365',
                   'daysFromTarget')

        millisPerDay = 1000 * 60 * 60 * 24
        self.set('unixTimeDays',
                 date.millis().divide(millisPerDay))
        return self.image
