import ee

from .segment import Segment


class Find(object):

    def __init__(self, collection, dateFormat, maxSegments):
        self.collection = collection
        self.dateFormat = dateFormat
        self.maxSegments = maxSegments
        self.segments = collection.toList(50)

    def addBands(self, expressionOrCallback, rename, replace):
        def process(segment):
            imageToAdd = self.evaluate(segment, expressionOrCallback)
            if rename:
                imageToAdd = imageToAdd.rename(rename)
            return segment.toImage().addBands(imageToAdd, None, replace)

        updatedCollection = self.map(process)
        return Find(updatedCollection, self.dateFormat, self.maxSegments)

    def addBandsReplace(self, expressionOrCallback, rename):
        return self.addBands(expressionOrCallback, rename, True)

    def updateMask(self, expressionOrCallback, expressionArgs):
        updatedCollection = self.map(
            lambda segment: segment.toImage().updateMask(self.evaluate(segment, expressionOrCallback, expressionArgs))
        )
        return Find(updatedCollection, self.dateFormat, self.maxSegments)

    def first(self):
        image = self.collection.reduce(ee.Reducer.firstNonNull()) \
            .regexpRename('(.*)_first', '$1')
        return Segment(image, self.dateFormat)

    def last(self):
        image = self.collection.reduce(ee.Reducer.lastNonNull()) \
            .regexpRename('(.*)_last', '$1')
        return Segment(image, self.dateFormat)

    def min(self, bandName):
        if not bandName:
            raise Error('Find.min(bandName): bandName is required')
        return self.find(ee.Reducer.min(), bandName)

    def max(self, bandName):
        if not bandName:
            raise Error('Find.max(bandName): bandName is required')
        return self.find(ee.Reducer.max(), bandName)

    def find(self, reducer, bandName):
        value = self.collection.select(bandName).reduce(reducer)
        found = self.collection.map(
            lambda image: image.updateMask(image.select(bandName).eq(value))
        ).mosaic()
        return Segment(ee.Image(found), self.dateFormat)

    def map(self, callback):

        def process(segmentImage):
            segment = Segment(ee.Image(segmentImage), self.dateFormat)
            return callback(segment)

        return ee.ImageCollection(
            self.segments.map(process)
        )

    def evaluate(self, segment, expressionOrCallback, expressionArgs):
        if hasattr(expressionOrCallback, '__call__'):
            return expressionOrCallback(segment, segment.toImage())
        else:
            return ee.Image().expression(expressionOrCallback, {'i': segment.toImage(), **expressionArgs})
