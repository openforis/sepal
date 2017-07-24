import ee
import math


class ImageOperation(object):
    def __init__(self, image):
        super(ImageOperation, self).__init__()
        self.image = image
        self.input_band_names = image.bandNames()

    def select(self, name):
        return self.image.select(name)

    def set(self, name, toAdd, args={}):
        toAdd = self.toImage(toAdd, args)
        self.image = self.image.addBands(toAdd.rename([name]), None, True)

    def setIf(self, name, condition, trueValue, args={}):
        self.setIfElse(name, condition, trueValue, name, args)

    def setIfElse(self, name, condition, trueValue, falseValue, args={}):
        self.set(name,
                 self.toImage(falseValue, args)
                 .where(self.toImage(condition, args), self.toImage(trueValue, args)))

    def invertMask(self, mask):
        return mask.multiply(-1).add(1)

    def toImage(self, band, args={}):
        if isinstance(band, basestring):
            if band.find('.') > -1 or band.find(' ') > -1 or band.find('{') > -1:
                band = self.image.expression(self.format(band, args), {'i': self.image})
            else:
                band = self.image.select(band)

        return ee.Image(band)

    def format(self, s, args={}):
        if not args:
            args = {}
        allArgs = self.merge({'pi': math.pi}, args)
        result = str(s).format(**allArgs)

        if result.find('{') > -1:
            return format(result, args)
        return result

    def isMasked(self, band):
        return self.toImage(band).mask().reduce('min').eq(0)

    def updateMask(self, condition):
        self.image = self.image.updateMask(self.toImage(condition))

    def merge(self, o1, o2):
        return dict(list(o1.iteritems()) + list(o2.iteritems()))
