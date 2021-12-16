import ee

from . import date_conversion, harmonic_fit
from .find import Find
from .segment import Segment


class Segments(object):
    def __init__(self, segmentsImage, dateFormat=0, maxSegments=50):
        self.segmentsImage = segmentsImage
        self.segmentsImage = self.updateImageMask(segmentsImage)
        self.dateFormat = dateFormat
        self.maxSegments = maxSegments

    def filterDate(self, fromDate, toDate):
        fromIndex = self.segmentIndex(ee.Date(fromDate), 'next')
        toIndex = self.segmentIndex(ee.Date(toDate), 'previous')
        return Segments(self.segmentsImage.arraySlice(0, fromIndex, toIndex.add(1)), self.dateFormat, self.maxSegments)

    def toFixedIntervals(self, fromDate, toDate, delta, unit):
        fromDate = ee.Date(fromDate)
        toDate = ee.Date(toDate)
        difference = toDate.difference(fromDate, unit).ceil()

        def process(advance):
            startDate = fromDate.advance(ee.Number(advance), unit)
            endDate = startDate.advance(delta, unit)
            intervalImage = self.filterDate(startDate, endDate).toImage()
            tStart = intervalImage.select('tStart').max(self.toT(startDate))
            tEnd = intervalImage.select('tEnd').min(self.toT(endDate))
            tBreak = intervalImage.select('tEnd').lte(self.toT(endDate)).multiply(intervalImage.select('tBreak')) \
                .rename('tBreak')
            return intervalImage \
                .addBands(tStart, None, True) \
                .addBands(tEnd, None, True) \
                .addBands(tBreak, None, True)

        intervalsImages = ee.List.sequence(0, difference.subtract(1), delta) \
            .map(process)
        head = ee.Image(intervalsImages.get(0))
        tail = ee.List(intervalsImages.slice(1))
        intervalsImage = ee.Image(
            tail.iterate(
                lambda image, acc: ee.Image(acc).arrayCat(ee.Image(image), 0),
                head
            )
        )
        return Segments(intervalsImage, self.dateFormat, self.maxSegments)

    def toArrayImage(self, collection):
        arrayImages = collection \
            .map(self.incrementDimensions) \
            .toList(self.maxSegments)
        emptyArrayImage = ee.Image(arrayImages.get(0)).arraySlice(0, 0, 0)
        return ee.Image(
            arrayImages.iterate(
                lambda image, acc: ee.Image(acc).arrayCat(ee.Image(image), 0),
                emptyArrayImage
            )
        )

    def incrementDimensions(self, image):
        def incrementDimension(image):
            image = image.select(0)
            dimension = getDimension(image)
            updatedImage = image \
                .toArray(dimension) \
                .rename(image.bandNames())
            return updatedImage \
                .unmask(createEmptyArrayImage(dimension))

        def createEmptyArrayImage(dimension, pixelType=ee.PixelType.double()):
            return ee.Image(ee.Array(
                ee.List.sequence(0, dimension.subtract(1)).iterate(
                    lambda i, acc: ee.List([ee.List(acc)]),
                    ee.List([])
                ), pixelType
            ))

        def getDimension(image):
            bandName = ee.String(image.bandNames().get(0))
            return bandName.match('.*_coefs').size().gt(
                0)  # Returns 0 if not .*_coefs, otherwise 1, which match the dimension

        return ee.Image(
            image.bandNames().iterate(
                lambda bandName, acc: ee.Image(acc).addBands(
                    incrementDimension(image.select(ee.String(bandName)))
                ),
                image.select([])
            )
        )

    def map(self, algorithm):
        collection = self.toCollection().map(
            lambda image: algorithm(Segment(image, self.dateFormat))
        )
        return self.toArrayImage(collection)

    def find(self):
        return Find(self.toCollection(), self.dateFormat, self.maxSegments)

    def findByDate(self, date, strategy='mask'):
        return Segment(
            self.getSegmentImage(
                self.segmentIndex(date, strategy)
            ),
            self.dateFormat,
            date
        )

    def first(self):
        return Segment(self.getSegmentImage(ee.Image(0)), self.dateFormat)

    def last(self):
        return Segment(self.getSegmentImage(self.count().subtract(1)), self.dateFormat)

    def min(self, bandName):
        if not bandName:
            raise Error('Find.min(bandName): bandName is required')
        return self.findSegment(ee.Reducer.min(), bandName)

    def max(self, bandName):
        if not bandName:
            raise Error('Find.max(bandName): bandName is required')
        return self.findSegment(ee.Reducer.max(), bandName)

    def findSegment(self, reducer, bandName):
        value = self.segmentsImage.select(bandName) \
            .arrayReduce(reducer, [0])
        value = value.updateMask(value.arrayLength(0)) \
            .arrayGet([0]) \
            .float()
        segmentsBand = self.segmentsImage.select(bandName).float()
        segmentIndex = self.getSegmentIndexes() \
            .arrayMask(segmentsBand.eq(value))
        segmentIndex = segmentIndex.updateMask(segmentIndex.arrayLength(0)) \
            .arrayGet([0])
        return Segment(self.getSegmentImage(segmentIndex), self.dateFormat)

    def getSegmentIndexes(self):
        return self.segmentsImage \
            .select(0).Not().Not() \
            .arrayAccum(0, ee.Reducer.sum()) \
            .subtract(1)

    def segmentIndex(self, date, strategy='mask'):
        t = ee.Image(self.toT(date))
        segmentIndexes = self.getSegmentIndexes()

        if (strategy == 'mask'):
            masked = segmentIndexes \
                .arrayMask(  # Segment must be in range
                self.segmentsImage.select('tStart').lte(t).And(
                    self.segmentsImage.select('tEnd').gte(t)
                )
            ) \
                .arrayReduce(ee.Reducer.first(), [0])
        elif (strategy == 'closest'):
            startDistance = self.segmentsImage.select('tStart').subtract(t).abs()
            endDistance = self.segmentsImage.select('tEnd').subtract(t).abs()
            distance = startDistance.min(endDistance) \
                .float()

            shortestDistance = distance.arrayReduce(ee.Reducer.min(), [0])
            shortestDistance = shortestDistance \
                .updateMask(shortestDistance.arrayLength(0).gt(0)) \
                .arrayFlatten([['distance']]) \
                .float()
            masked = segmentIndexes \
                .arrayMask(distance.eq(shortestDistance))
        elif (strategy == 'previous'):
            masked = segmentIndexes \
                .arrayMask(  # Mask out later segments
                self.segmentsImage.select('tStart').lt(t)
            ) \
                .arrayReduce(ee.Reducer.lastNonNull(), [0])
        elif (strategy == 'next'):
            masked = segmentIndexes \
                .arrayMask(  # Mask out earlier segments
                self.segmentsImage.select('tEnd').gt(t)
            ) \
                .arrayReduce(ee.Reducer.first(), [0])
        else:
            raise Error('Unsupported strategy: ' + strategy + '. Allows mask (default), closest, previous, and next')

        return masked \
            .updateMask(masked.arrayLength(0).gt(0)) \
            .arrayFlatten([['segmentIndex']]) \
            .int8()

    def toT(self, date):
        return date_conversion.toT(date, self.dateFormat)

    def fromT(self, t):
        return date_conversion.fromT(t, self.dateFormat)

    def count(self):
        return self.segmentsImage.select(0).arrayLength(0)

    def interpolate(self, date, harmonics=3):
        startSegment = self.findByDate(date, 'previous')
        endSegment = self.findByDate(date, 'next')
        tStart = startSegment.toImage('tEnd')
        tEnd = endSegment.toImage('tStart')
        startValue = startSegment.endFit(0)
        endValue = endSegment.startFit(0)
        slope = endValue.subtract(startValue).divide(tEnd.subtract(tStart))
        offset = startValue.subtract(slope.multiply(tStart))
        t = ee.Image(self.toT(date))  # TODO: Allow t instead of date as arg?
        tEndWeight = t.subtract(tStart).divide(tEnd.subtract(tStart))
        tStartWeight = ee.Image(1).subtract(tEndWeight)
        startCoefs = startSegment.toImage('.*_coefs')
        endCoefs = endSegment.toImage('.*_coefs')
        offsetCoefs = ee.Image(ee.Array([1, 0, 0, 0, 0, 0, 0, 0])).multiply(offset)
        slopeCoefs = ee.Image(ee.Array([0, 1, 0, 0, 0, 0, 0, 0])).multiply(slope)
        weightedCoefs = startCoefs \
            .multiply(tStartWeight).add(
            endCoefs.multiply(tEndWeight)
        )
        harmonicCoefs = ee.Image(ee.Array([0, 0, 1, 1, 1, 1, 1, 1])).multiply(weightedCoefs)
        coefs = offsetCoefs.add(slopeCoefs).add(harmonicCoefs)
        interpolated = harmonic_fit.fitImage(coefs, t, self.dateFormat, harmonics) \
            .rename(startValue.bandNames())
        fit = self.findByDate(date, 'mask').fit(harmonics=harmonics)
        return interpolated \
            .where(fit.mask(), fit)

    def transitions(self):
        image = self.toImage()
        from_segment = image.arraySlice(0, 0, -2)
        to_segment = image.arraySlice(0, 1, -1)
        transitionImage = from_segment.select('tStart') \
            .addBands(from_segment.select('tEnd')) \
            .addBands(from_segment.select('tBreak')) \
            .addBands(from_segment.regexpRename('(.*)', 'from_$1', False)) \
            .addBands(to_segment.regexpRename('(.*)', 'to_$1', False))
        return Segments(transitionImage, self.dateFormat, self.maxSegments)

    def sample(self, features, mapSegment, scale=30):
        def process(feature, features):
            feature = ee.Feature(feature)
            segment = self.findByDate(ee.Date(feature.get('date')))
            imageToSample = mapSegment(segment, segment.toImage())

            sample = imageToSample.sample(
                region=feature.geometry(),
                scale=scale,
            ) \
                .map(
                lambda sample: sample.copyProperties(source=feature, exclude=['date'])
            )
            return ee.FeatureCollection(features).merge(sample)

        samples = ee.FeatureCollection(features.iterate(process, ee.FeatureCollection([])))
        return samples \
            .set('band_order',
            samples.first().propertyNames().slice(1))  # inputProperties default in Classifier.train()

    def toImage(self, selector='.*'):
        return self.segmentsImage.select(selector)

    def toCollection(self):
        segmentCount = self.count()

        def process_iteration(i, acc):
            image = ee.Image([]).set('imageIndex', i)
            return ee.ImageCollection(acc).merge(ee.ImageCollection([image]))

        def process_map(image):
            imageIndex = ee.Image(ee.Number(image.get('imageIndex')))
            segmentIndex = segmentCount.subtract(1).min(imageIndex)
            return self.getSegmentImage(segmentIndex) \
                .updateMask(imageIndex.lt(segmentCount))

        imageCollection = ee.ImageCollection(
            ee.List.sequence(0, ee.Number(self.maxSegments).subtract(1)).iterate(process_iteration,
                ee.ImageCollection([]))
        ) \
            .map(process_map)
        return imageCollection

    # def toAsset(self, **exportArgs):
    #     Export.image.toAsset(scale=30, pyramidingPolicy={'.default': 'sample'}, image=segmentsImage, **exportArgs)

    def updateImageMask(self, segmentsImage):
        return segmentsImage \
            .addBands(
            segmentsImage.select(self.bandNames1D())
                .unmask(ee.Array([], ee.PixelType.double())),
            None,
            True
        ) \
            .addBands(
            segmentsImage.select(self.bandNames2D())
                .unmask(ee.Array([[]], ee.PixelType.double())),
            None,
            True
        ) \
            .mask(segmentsImage.select(0).arrayLength(0).unmask(0))

    def getSegmentImage(self, segmentIndex):
        mask = self.getSegmentIndexes().eq(segmentIndex.unmask(-1))
        image1D = self.segmentsImage.select(self.bandNames1D()) \
            .arrayMask(mask)
        image1D = image1D.mask(image1D.select(0).arrayLength(0).unmask(0)) \
            .arrayProject([0]) \
            .arrayGet([0])

        image2D = self.segmentsImage.select(self.bandNames2D()) \
            .arrayMask(mask.toArray(1).unmask(ee.Array([[]], ee.PixelType.double())))
        image2D = image2D.mask(image2D.select(0).arrayLength(0).unmask(0)) \
            .arrayProject([1])

        return image1D \
            .addBands(image2D)

    def bandNames1D(self):
        return self.segmentsImage.bandNames().filter(ee.Filter.stringEndsWith('item', '_coefs').Not())

    def bandNames2D(self):
        return self.segmentsImage.bandNames().filter(ee.Filter.stringEndsWith('item', '_coefs'))

    def combinePairwise(self, image, algorithm, suffix=''):
        def process(b1, accImage):
            b1 = ee.String(b1)
            accImage = ee.Image(accImage)
            img1 = image.select(b1).rename('img1')
            i1 = image.bandNames().indexOf(b1)

            def nested(b2, accImage):
                b2 = ee.String(b2)
                accImage = ee.Image(accImage)
                img2 = image.select(b2).rename('img2')
                return accImage.addBands(
                    algorithm(img1, img2) \
                        .rename(b1.cat('_').cat(b2).cat(suffix))
                )

            combinations = ee.Image(image.bandNames().slice(i1.add(1)).iterate(nested, ee.Image([])))
            return accImage.addBands(combinations)

        return ee.Image(image.bandNames().iterate(process, ee.Image([])))
