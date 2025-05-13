const ee = require('#sepal/ee/ee')
var J_DAYS = 0
var FRACTIONAL_YEARS = 1
var UNIX_TIME_MILLIS = 2

function Segments(segmentsImage, dateFormat, maxSegments) {
    segmentsImage = updateImageMask(segmentsImage)
    segmentsImage = segmentsImage
        .addBands(segmentsImage.select('.*_coefs').arrayPad([0, 8]), null, true)
    dateFormat = dateFormat === undefined ? 0 : dateFormat
    maxSegments = maxSegments ? maxSegments : 50

    return {
        dateRange: dateRange,
        filterDate: filterDate,
        toFixedIntervals: toFixedIntervals,
        find: find,
        findByDate: findByDate,
        first: first,
        last: last,
        min: min,
        max: max,
        segmentIndex: segmentIndex,
        toT: toT,
        fromT: fromT,
        count: count,
        interpolate: interpolate,
        transitions: transitions,
        sample: sample,
        classify: classify,
        map: map,
        toImage: toImage,
        toCollection: toCollection,
        toArrayImage: toArrayImage,
        toAsset: toAsset,
        combinePairwise: combinePairwise,
        dateFormat: function () { return dateFormat }
    }

    function dateRange(fromDate, toDate) {
        if (!fromDate || !toDate)
            throw new Error('Segments.dateRange(fromDate, toDate): fromDate and toDate are required')
        return DateRange(this, fromDate, toDate)
    }

    function filterDate(fromDate, toDate) {
        var fromIndex = segmentIndex(ee.Date(fromDate), 'next')
        var toIndex = segmentIndex(ee.Date(toDate), 'previous')
        return Segments(segmentsImage.arraySlice(0, fromIndex, toIndex.add(1)), dateFormat, maxSegments)
    }

    function toFixedIntervals(fromDate, toDate, delta, unit) {
        fromDate = ee.Date(fromDate)
        toDate = ee.Date(toDate)
        var difference = toDate.difference(fromDate, unit).ceil()
        var intervalsImages = ee.List.sequence(0, difference.subtract(1), delta)
            .map(function (advance) {
                var startDate = fromDate.advance(ee.Number(advance), unit)
                var endDate = startDate.advance(delta, unit)
                var intervalImage = filterDate(startDate, endDate).toImage()
                var tStart = intervalImage.select('tStart').max(toT(startDate))
                var tEnd = intervalImage.select('tEnd').min(toT(endDate))
                var tBreak = intervalImage.select('tEnd').lte(toT(endDate)).multiply(intervalImage.select('tBreak'))
                    .rename('tBreak')
                return intervalImage
                    .addBands(tStart, null, true)
                    .addBands(tEnd, null, true)
                    .addBands(tBreak, null, true)
            })
        var head = ee.Image(intervalsImages.get(0))
        var tail = ee.List(intervalsImages.slice(1))
        var intervalsImage = ee.Image(
            tail.iterate(function (image, acc) {
                return ee.Image(acc).arrayCat(ee.Image(image), 0)
            }, head)
        )
        return Segments(intervalsImage, dateFormat, maxSegments)
    }


    function toArrayImage(collection) {
        var arrayImages = collection
            .map(incrementDimensions)
            .toList(maxSegments)
        var emptyArrayImage = ee.Image(arrayImages.get(0)).arraySlice(0, 0, 0)
        return ee.Image(
            arrayImages.iterate(function (image, acc) {
                return ee.Image(acc)
                    .arrayCat(ee.Image(image), 0)
            }, emptyArrayImage)
        )
    }


    function incrementDimensions(image) {
        return ee.Image(
            image.bandNames().iterate(function (bandName, acc) {
                return ee.Image(acc).addBands(
                    incrementDimension(image.select(ee.String(bandName)))
                )
            }, image.select([]))
        )

        function incrementDimension(image) {
            image = image.select(0)
            var dimension = getDimension(image)
            var updatedImage = image
                .toArray(dimension)
                .rename(image.bandNames())
            var unmaskValue = createEmptyArrayImage(dimension)
            return updatedImage
                .unmask(createEmptyArrayImage(dimension))
        }

        function createEmptyArrayImage(dimension, pixelType) {
            pixelType = pixelType || ee.PixelType.double()

            return ee.Image(ee.Array(
                ee.List.sequence(0, dimension.subtract(1)).iterate(function (i, acc) {
                    return ee.List([ee.List(acc)])
                }, ee.List([])),
                pixelType
            ))
        }

        function getDimension(image) {
            var bandName = ee.String(image.bandNames().get(0))
            return bandName.match('.*_coefs').size().gt(0) // Returns 0 if not .*_coefs, otherwise 1, which match the dimension
        }
    }


    function map(algorithm) {
        var collection = toCollection().map(function (image) {
            return algorithm(Segment(image, dateFormat))
        })
        return toArrayImage(collection)
    }

    function find() {
        return Find(toCollection(), dateFormat, maxSegments)
    }


    function findByDate(date, strategy) {
        return Segment(
            getSegmentImage(
                segmentIndex(date, strategy)
            ),
            dateFormat,
            date
        )
    }


    function first() {
        return Segment(getSegmentImage(ee.Image(0)), dateFormat)
    }


    function last() {
        return Segment(getSegmentImage(count().subtract(1)), dateFormat)
    }


    function min(bandName) {
        if (!bandName)
            throw new Error('Find.min(bandName): bandName is required')
        return findSegment(ee.Reducer.min(), bandName)
    }


    function max(bandName) {
        if (!bandName)
            throw new Error('Find.max(bandName): bandName is required')
        return findSegment(ee.Reducer.max(), bandName)
    }


    function findSegment(reducer, bandName) {
        var value = segmentsImage.select(bandName)
            .arrayReduce(reducer, [0])
        value = value.updateMask(value.arrayLength(0))
            .arrayGet([0])
            .float()
        var segmentsBand = segmentsImage.select(bandName).float()
        var segmentIndex = getSegmentIndexes()
            .arrayMask(segmentsBand.eq(value))
        segmentIndex = segmentIndex.updateMask(segmentIndex.arrayLength(0))
            .arrayGet([0])
        return Segment(getSegmentImage(segmentIndex), dateFormat)
    }


    function getSegmentIndexes() {
        return segmentsImage
            .select(0).not().not() // An array of 1 for each segment
            .arrayAccum(0, ee.Reducer.sum()) // An array from 1 to number of segments
            .subtract(1) // Start indexes at 0
    }


    function segmentIndex(date, strategy) {
        strategy = strategy || 'mask'
        var t = ee.Image(toT(date))
        var segmentIndexes = getSegmentIndexes()

        var masked

        function getPrevious() {
            return segmentIndexes
                .arrayMask( // Mask out later segments
                    segmentsImage.select('tStart').lte(t)
                )
                .arrayReduce(ee.Reducer.lastNonNull(), [0])
        }

        function getNext() {
            return segmentIndexes
                .arrayMask( // Mask out earlier segments
                    segmentsImage.select('tEnd').gt(t)
                )
                .arrayReduce(ee.Reducer.first(), [0])
        }

        if (strategy === 'mask') {
            masked = segmentIndexes
                .arrayMask( // Segment must be in range
                    segmentsImage.select('tStart').lte(t).and(
                        segmentsImage.select('tEnd').gte(t)
                    )
                )
                .arrayReduce(ee.Reducer.first(), [0])
        } else if (strategy === 'closest') {
            var previousDistance = segmentsImage.select('tStart').subtract(t).abs()
                .arrayReduce(ee.Reducer.min(), [0]).arrayGet([0])
            var nextDistance = segmentsImage.select('tEnd').subtract(t).abs()
                .arrayReduce(ee.Reducer.min(), [0]).arrayGet([0])
            masked = getPrevious().where(nextDistance.gt(previousDistance), getNext())
        } else if (strategy === 'previous') {
            masked = getPrevious()
        } else if (strategy === 'next') {
            masked = getNext()
        } else {
            throw new Error('Unsupported strategy: ' + strategy + '. Allows mask (default), closest, previous, and next')
        }
        return masked
            .updateMask(masked.arrayLength(0).gt(0))
            .arrayFlatten([['segmentIndex']])
            .int8()
    }


    function toT(date) {
        return dateConversion.toT(date, dateFormat)
    }


    function fromT(t) {
        return dateConversion.fromT(t, dateFormat)
    }


    function count() {
        return segmentsImage.select(0).arrayLength(0)
    }


    function interpolate(date, harmonics) {
        harmonics = harmonics === undefined ? 3 : harmonics
        var startSegment = findByDate(date, 'previous')
        var endSegment = findByDate(date, 'next')
        var tStart = startSegment.toImage('tEnd')
        var tBreak = startSegment.toImage('tBreak')
        var tEnd = endSegment.toImage('tStart')
        var startValue = startSegment.endSlice(0)
        var endValue = endSegment.startSlice(0)
        var slope = endValue.subtract(startValue).divide(tEnd.subtract(tStart))
        var intercept = startValue.subtract(slope.multiply(tStart))
        var t = ee.Image(toT(date)) // TODO: Allow t instead of date as arg?
        var tEndWeight = t.subtract(tStart).divide(tEnd.subtract(tStart))
        var tStartWeight = ee.Image(1).subtract(tEndWeight)
        var startCoefs = startSegment.toImage('.*_coefs')
        var endCoefs = endSegment.toImage('.*_coefs')
        var interceptCoefs = intercept.multiply(ee.Image(ee.Array([1, 0, 0, 0, 0, 0, 0, 0])))
        var slopeCoefs = slope.multiply(ee.Image(ee.Array([0, 1, 0, 0, 0, 0, 0, 0])))
        var weightedCoefs = startCoefs
            .multiply(tStartWeight).add(
                endCoefs.multiply(tEndWeight)
            )
        var harmonicCoefs = weightedCoefs.multiply(ee.Image(ee.Array([0, 0, 1, 1, 1, 1, 1, 1])))
        var coefs = interceptCoefs.add(slopeCoefs).add(harmonicCoefs)
            .regexpRename('(.*)', '$1_coefs', false)
        var interpolated = harmonicSlice.sliceImage(coefs, t, dateFormat, harmonics)
            .rename(startValue.bandNames())
            .addBands(intercept.regexpRename('(.*)', '$1_intercept', false))
            .addBands(slope.regexpRename('(.*)', '$1_slope', false))
            .addBands(harmonicSlice.phaseAndAmplitude(coefs, harmonics))
            .addBands(
                startSegment.toImage('.*_rmse').multiply(tStartWeight).pow(2)
                    .add(endSegment.toImage('.*_rmse').multiply(tEndWeight).pow(2)).sqrt()
            )
            .addBands(
                startSegment.toImage('numObs').multiply(tStartWeight).pow(2)
                    .add(endSegment.toImage('numObs').multiply(tEndWeight).pow(2)).sqrt().int16()
            )

        var segment = findByDate(date, 'mask')
        var slice = segment.slice({ harmonics: harmonics })
            .addBands(segment.toImage('.*_coefs').arrayGet([0])
                .regexpRename('(.*)_coefs', '$1_intercept', false)
            )
            .addBands(segment.toImage('.*_coefs').arrayGet([1])
                .regexpRename('(.*)_coefs', '$1_slope', false)
            )
            .addBands(harmonicSlice.phaseAndAmplitude(segment.toImage('.*_coefs'), harmonics))
            .addBands(segment.toImage('.*_rmse'))
            .addBands(segment.toImage('numObs'))
        var magnitude = startSegment.toImage('.*_magnitude').regexpRename('(.*)_magnitude', '$1', false)
        var rmse = startSegment.toImage('.*_rmse').regexpRename('(.*)_rmse', '$1', false)
        var breakConfidence = magnitude.divide(rmse).regexpRename('(.*)', '$1_breakConfidence', false)
        var result = interpolated
            .where(slice.mask(), slice)
            .addBands(tStart)
            .addBands(tBreak)
            .addBands(tEnd)
            .addBands(startSegment.toImage(['.*_magnitude', 'changeProb']))
            .addBands(breakConfidence)
        return result.select(sliceBandNames(coefs, harmonics))
    }

    function transitions() {
        return Transitions(this)
    }


    function sample(features, mapSegment, scale) {
        scale = scale || 30
        var collection = toCollection()
        var samples = ee.FeatureCollection(features.iterate(function (feature, features) {
            feature = ee.Feature(feature)
            var segment = findByDate(ee.Date(feature.get('date')))
            var imageToSample = mapSegment(segment, segment.toImage())

            var sample = imageToSample.sample({
                region: feature.geometry(),
                scale: scale,
            })
                .map(function (sample) {
                    return sample.copyProperties({ source: feature, exclude: ['date'] })
                })
            return ee.FeatureCollection(features).merge(sample)
        }, ee.FeatureCollection([])))
        return samples
            .set('band_order', samples.first().propertyNames().slice(1)) // inputProperties default in Classifier.train()
    }


    function classify(classifier, mapSegment, bandName) {
        bandName = bandName || 'type'
        var classificationsImage = map(function (segment) {
            var imageToClassify = mapSegment(segment, segment.toImage())
            return imageToClassify
                .classify(classifier)
        })
            .rename(bandName)
            .byte()
        return Classification(classificationsImage, this)
    }


    function toImage(selector) {
        return selector === undefined
            ? segmentsImage
            : segmentsImage.select(selector)
    }


    function toCollection() {
        var segmentCount = count()
        var imageCollection = ee.ImageCollection(
            ee.List.sequence(0, ee.Number(maxSegments).subtract(1)).iterate(function (i, acc) {
                var image = ee.Image([]).set('imageIndex', i)
                return ee.ImageCollection(acc).merge(ee.ImageCollection([image]))
            }, ee.ImageCollection([]))
        )
            .map(function (image) {
                var imageIndex = ee.Image(ee.Number(image.get('imageIndex')))
                var segmentIndex = segmentCount.subtract(1).min(imageIndex)
                return getSegmentImage(segmentIndex)
                    .updateMask(imageIndex.lt(segmentCount))
            })
        return imageCollection
    }


    function toAsset(exportArgs) {
        Export.image.toAsset(mergeObjects([
            {
                scale: 30,
                crs: segmentsImage.projection().crs(),
                pyramidingPolicy: { '.default': 'sample' }
            },
            exportArgs,
            { image: segmentsImage }
        ]))
    }


    function updateImageMask(segmentsImage) {
        return segmentsImage
            .addBands(
                segmentsImage.select(bandNames1D())
                    .unmask(ee.Array([], ee.PixelType.double())),
                null,
                true
            )
            .addBands(
                segmentsImage.select(bandNames2D())
                    .unmask(ee.Array([[]], ee.PixelType.double())),
                null,
                true
            )
            .mask(segmentsImage.select(0).arrayLength(0).unmask(0))
    }


    function getSegmentImage(segmentIndex) {
        var mask = getSegmentIndexes().eq(segmentIndex.unmask(-1))
        var image1D = segmentsImage.select(bandNames1D())
            .arrayMask(mask)
        image1D = image1D.mask(image1D.select(0).arrayLength(0).unmask(0))
            .arrayProject([0])
            .arrayGet([0])

        var image2D = segmentsImage.select(bandNames2D())
            .arrayMask(mask.toArray(1).unmask(ee.Array([[]], ee.PixelType.double())))
        image2D = image2D.mask(image2D.select(0).arrayLength(0).unmask(0))
            .arrayProject([1])

        return image1D
            .addBands(image2D)
    }


    function bandNames1D() {
        return segmentsImage.bandNames().filter(ee.Filter.stringEndsWith('item', '_coefs').not())
    }


    function bandNames2D() {
        return segmentsImage.bandNames().filter(ee.Filter.stringEndsWith('item', '_coefs'))
    }


    function combinePairwise(image, algorithm, suffix) {
        suffix = suffix || ''
        return ee.Image(image.bandNames().iterate(function (b1, accImage) {
            b1 = ee.String(b1)
            accImage = ee.Image(accImage)
            var img1 = image.select(b1).rename('img1')
            var i1 = image.bandNames().indexOf(b1)
            var combinations = ee.Image(image.bandNames().slice(i1.add(1)).iterate(function (b2, accImage) {
                b2 = ee.String(b2)
                accImage = ee.Image(accImage)
                var img2 = image.select(b2).rename('img2')
                return accImage.addBands(
                    algorithm(img1, img2)
                        .rename(b1.cat('_').cat(b2).cat(suffix || ''))
                )
            }, ee.Image([])))
            return accImage.addBands(combinations)
        }, ee.Image([])))
        return segment.select('ndfi_.*')
            .addBands(segment.select('.*_avg'), null, true)
            .addBands(segment.expression('s.numObs / (s.tEnd - s.tStart)',
                { s: segment }).rename('densityObs')
            )
            .addBands(nd)
    }
}


function DateRange(segments, fromDate, toDate) {
    var dateFormat = segments.dateFormat()

    return {
        mean: mean,
        pickBreakpoint: pickBreakpoint
    }

    function pickBreakpoint(options) {
        var breakAnalysisBand = options.breakAnalysisBand
        var skipBreakInLastSegment = !!options.breakAnalysisBand
        var breakMagnitudeDirection = options.breakMagnitudeDirection || 'ANY'
        var minBreakConfidence = options.minBreakConfidence || 0
        var breakSelection = options.breakSelection || 'FIRST'

        var tEndMax = skipBreakInLastSegment ? segments.last().toImage('tEnd') : Number.MAX_SAFE_INTEGER
        var filteredSegments = segments.filterDate(fromDate, toDate)
        var segment = findSegment()
        var segmentImage = segment.toImage(['tBreak', 'changeProb', '.*_magnitude', '.*_rmse'])
        var breakConfidence = segmentImage.select('.*_magnitude').abs()
            .divide(segmentImage.select('.*_rmse'))
            .regexpRename('(.*)_magnitude', '$1_breakConfidence')
        var result = segmentImage
            .select(['tBreak', 'changeProb', '.*_magnitude'])
            .addBands(breakConfidence)
            .unmask(0)
            .updateMask(filteredSegments.toImage('tStart').mask())
        return result

        function findSegment() {
            var segmentQuery = (breakAnalysisBand
                ? filteredSegments.find().addBands(
                    'abs(i.' + breakAnalysisBand + '_magnitude) / i.' + breakAnalysisBand + '_rmse', breakAnalysisBand + '_breakConfidence'
                )
                : filteredSegments.find()
            )
                .updateMask(function (segment, image) {
                    var inDateRange = ee.Image().expression('tBreak >= start and tBreak < end and tEnd < tEndMax', {
                        tEnd: image.select('tEnd'),
                        tBreak: image.select('tBreak'),
                        start: filteredSegments.toT(ee.Date(fromDate)),
                        end: filteredSegments.toT(ee.Date(toDate)),
                        tEndMax: tEndMax
                    })
                    if (minBreakConfidence && breakAnalysisBand) {
                        var overMinConfidence = image.select(breakAnalysisBand + '_breakConfidence')
                            .gte(minBreakConfidence)
                        var magnitude = image.select(breakAnalysisBand + '_magnitude')
                        var correctDirection = breakMagnitudeDirection === 'INCREASE'
                            ? magnitude.gte(0)
                            : breakMagnitudeDirection === 'DECREASE'
                                ? magnitude.lte(0)
                                : ee.Image(1)
                        return inDateRange
                            .and(overMinConfidence)
                            .and(correctDirection)
                    } else {
                        return inDateRange
                    }
                })
            var effectiveBreakSelection = breakAnalysisBand
                ? breakSelection
                : breakSelection === 'LAST'
                    ? 'LAST'
                    : 'FIRST'
            return pick(segmentQuery, effectiveBreakSelection)
        }

        function pick(segmentQuery, breakSelection) {
            switch (breakSelection) {
                case 'FIRST': return segmentQuery.first()
                case 'LAST': return segmentQuery.last()
                case 'MAGNITUDE': return segmentQuery.max(breakAnalysisBand + '_magnitude')
                case 'CONFIDENCE': return segmentQuery.max(breakAnalysisBand + '_breakConfidence')
                default: return segmentQuery.first()
            }
        }
    }

    function mean(harmonics) {
        var filteredSegments = segments.filterDate(fromDate, toDate)
        harmonics = harmonics >= 0 ? harmonics : 3
        var tStart = filteredSegments.toImage('tStart').max(filteredSegments.toT(fromDate))
        var tEnd = filteredSegments.toImage('tEnd').min(filteredSegments.toT(toDate))
        var coefs = filteredSegments.toImage('.*_coefs')
        var intercept = coefs
            .arraySlice(1, 0, 1)
            .arrayProject([0])
            .regexpRename('(.*)_coefs', '$1_intercept', true)
        var slope = coefs
            .arraySlice(1, 1, 2)
            .arrayProject([0])
            .regexpRename('(.*)_coefs', '$1_slope', true)
        var phases = sequence(1, harmonics).reduce(function (acc, harmonic) {
            var i = ee.Number(harmonic).multiply(2)
            var coef1 = coefs
                .arraySlice(1, i, i.add(1))
                .arrayProject([0])
            var coef2 = coefs
                .arraySlice(1, i.add(1), i.add(2))
                .arrayProject([0])
            return acc.addBands(
                coef1
                    .atan2(coef2)
                    .float()
                    .regexpRename('(.*)_coefs', '$1_phase_' + harmonic, false)
            )
        }, ee.Image().select([]))
        var amplitudes = sequence(1, harmonics).reduce(function (acc, harmonic) {
            var i = ee.Number(harmonic).multiply(2)
            var coef1 = coefs
                .arraySlice(1, i, i.add(1))
                .arrayProject([0])
            var coef2 = coefs
                .arraySlice(1, i.add(1), i.add(2))
                .arrayProject([0])
            return acc.addBands(
                coef1
                    .hypot(coef2)
                    .float()
                    .regexpRename('(.*)_coefs', '$1_amplitude_' + harmonic, false)
            )
        }, ee.Image().select([]))
        var segmentDuration = filteredSegments.toImage('tEnd').subtract(filteredSegments.toImage('tStart'))
        var duration = tEnd.subtract(tStart)
        var numObs = filteredSegments.toImage('numObs').multiply(duration).divide(segmentDuration).max(1)
        var rmse = filteredSegments.toImage('.*_rmse').divide(numObs.sqrt())
        var mean = harmonicSlice.meanArrayImage(coefs, tStart, tEnd, dateFormat, harmonics)
            .addBands(rmse)
            .addBands(numObs)
            .addBands(intercept)
            .addBands(slope)
            .addBands(phases)
            .addBands(amplitudes)
        var breakpoint = pickBreakpoint({
            breakMagnitudeDirection: 'ANY',
            minBreakConfidence: 0,
            breakSelection: 'FIRST'
        })
        var result = mean.multiply(duration).arrayReduce(ee.Reducer.sum(), [0])
            .divide(duration.arrayReduce(ee.Reducer.sum(), [0]))
            .arrayGet([0])
            .addBands(filteredSegments.first().toImage(['tStart']))
            .addBands(filteredSegments.last().toImage('tEnd'))
            .addBands(breakpoint, null, true)
        return result.select(sliceBandNames(coefs, harmonics))
    }
}


function Segment(segmentImage, dateFormat, defaultDate) {
    var defaultT = toT(defaultDate) || segmentImage.expression('(i.tStart + i.tEnd) / 2', { i: segmentImage })

    return {
        slice: slice,
        startSlice: startSlice,
        endSlice: endSlice,
        middleSlice: middleSlice,
        slice: slice, // deprecated, use slice() instead
        startFit: startSlice, // deprecated, use startSlice() instead
        middleFit: middleSlice, // deprecated, use middleSlice() instead
        endFit: endSlice, // deprecated, use startSlice() instead
        mean: mean,
        toT: toT,
        fromT: fromT,
        coefs: coefs,
        intercept: intercept,
        slope: slope,
        phase: phase,
        amplitude: amplitude,
        toImage: toImage,
        dateFormat: function () { return dateFormat }
    }


    function slice(options) {
        var defaultOptions = {
            t: defaultT,
            harmonics: 3,
            extrapolateMaxDays: 0,
            extrapolateMaxFraction: 0,
            strategy: 'mask'
        }
        options = mergeObjects([defaultOptions, options])

        var t = ee.Image(options.date ? toT(options.date) : options.t)
        var harmonics = options.harmonics
        var tStart = segmentImage.select('tStart')
        var tEnd = segmentImage.select('tEnd')

        var daysFromStart = dateConversion.days(t, tStart, dateFormat)
        var daysFromEnd = dateConversion.days(tEnd, t, dateFormat)

        var coefs = segmentImage.select('.*_coefs')
        if (options.strategy !== 'closest') {
            var extrapolateMaxDays = options.extrapolateMaxFraction
                ? dateConversion.days(tStart, tEnd, dateFormat).multiply(options.extrapolateMaxFraction).round()
                : ee.Image(options.extrapolateMaxDays)
            extrapolateMaxDays = extrapolateMaxDays.where(extrapolateMaxDays.lt(0), ee.Image(Number.MAX_SAFE_INTEGER))

            var daysFromSegment = daysFromStart
                .max(daysFromEnd)
                .max(0)

            return harmonicSlice.sliceImage(coefs, t, dateFormat, harmonics)
                .updateMask(extrapolateMaxDays.gte(daysFromSegment))
        } else {
            var tUsed = t
                .where(daysFromStart.gt(0), tStart)
                .where(daysFromEnd.gt(0), tEnd)
            return harmonicSlice.sliceImage(coefs, tUsed, dateFormat, harmonics)
        }
    }


    function startSlice(harmonics) {
        return slice({ t: segmentImage.select('tStart'), harmonics: harmonics })
    }


    function endSlice(harmonics) {
        return slice({ t: segmentImage.select('tEnd'), harmonics: harmonics })
    }


    function middleSlice(harmonics) {
        var t = segmentImage.expression('i.tStart + (i.tEnd - i.tStart) / 2', { i: segmentImage })
        return slice({ t: t, harmonics: harmonics })
    }


    function mean(harmonics) {
        return harmonicSlice.meanImage(
            segmentImage.select('.*_coefs'),
            segmentImage.select('tStart'),
            segmentImage.select('tEnd'),
            dateFormat,
            harmonics
        )
    }


    function toT(date) {
        return dateConversion.toT(date, dateFormat)
    }


    function fromT(t) {
        return dateConversion.fromT(t, dateFormat)
    }


    function coefs(bandName) {
        return ee.Image(
            sequence(0, 8).map(function (coefIndex) {
                return segmentImage
                    .select(ee.String(bandName).cat('_coefs'))
                    .arrayGet([coefIndex])
                    .rename(ee.String(bandName).cat('_coef_' + coefIndex))
            })
        )
    }

    function intercept() {
        return segmentImage
            .select('.*_coefs')
            .arrayGet([0])
            .regexpRename('(.*)_coefs', '$1_intercept', false)
    }

    function slope() {
        return segmentImage
            .select('.*_coefs')
            .arrayGet([1])
            .regexpRename('(.*)_coefs', '$1_slope', false)
    }

    function phase(harmonic) {
        var harmonic = harmonic || 1
        return coefsToPhase(segmentImage.select('.*_coefs'), harmonic)
    }

    function amplitude(harmonic) {
        var harmonic = harmonic || 1
        return coefsToAmplitude(segmentImage.select('.*_coefs'), harmonic)
    }

    function toImage(selector) {
        return selector === undefined
            ? segmentImage
            : segmentImage.select(selector)
    }
}


function Classification(classificationsImage, segments) {
    return mergeObjects([
        Segments(segments.toImage().addBands(classificationsImage), segments.dateFormat()), // TODO: add maxSegments
        { toAsset: toAsset }
    ])

    function toAsset(exportArgs) {
        var projection = segments.toImage().projection()
        Export.image.toAsset(mergeObjects([
            {
                scale: 30,
                crs: projection.crs(),
                pyramidingPolicy: { '.default': 'sample' }
            },
            exportArgs,
            { image: classificationsImage }
        ]))
    }
}


function Transitions(segments) {
    var image = segments.toImage()
    var from = image.arraySlice(0, 0, -2)
    var to = image.arraySlice(0, 1, -1)
    var transitionImage = from.select('tStart')
        .addBands(from.select('tEnd'))
        .addBands(from.select('tBreak'))
        .addBands(from.regexpRename('(.*)', 'from_$1', false))
        .addBands(to.regexpRename('(.*)', 'to_$1', false))
    return Segments(transitionImage, segments.dateFormat())
}


function Find(collection, dateFormat, maxSegments) {
    var segments = collection.toList(50)
    return {
        addBands: addBands,
        updateMask: updateMask,
        first: first,
        last: last,
        min: min,
        max: max
    }


    function addBands(expressionOrCallback, rename, replace) {
        var updatedCollection = map(function (segment) {
            var imageToAdd = evaluate(segment, expressionOrCallback)
            if (rename)
                imageToAdd = imageToAdd.rename(rename)
            return segment.toImage().addBands(imageToAdd, null, replace)
        })
        return Find(updatedCollection, dateFormat, maxSegments)
    }


    function addBandsReplace(expressionOrCallback, rename) {
        return addBands(expressionOrCallback, rename, true)
    }


    function updateMask(expressionOrCallback, expressionArgs) {
        var updatedCollection = map(function (segment) {
            return segment.toImage().updateMask(evaluate(segment, expressionOrCallback, expressionArgs))
        })
        return Find(updatedCollection, dateFormat, maxSegments)
    }


    function first() {
        var image = collection.reduce(ee.Reducer.firstNonNull())
            .regexpRename('(.*)_first', '$1', false)
        return Segment(image, dateFormat)
    }


    function last() {
        var image = collection.reduce(ee.Reducer.lastNonNull())
            .regexpRename('(.*)_last', '$1', false)
        return Segment(image, dateFormat)
    }


    function min(bandName) {
        if (!bandName)
            throw new Error('Find.min(bandName): bandName is required')
        return find(ee.Reducer.min(), bandName)
    }


    function max(bandName) {
        if (!bandName)
            throw new Error('Find.max(bandName): bandName is required')
        return find(ee.Reducer.max(), bandName)
    }


    function find(reducer, bandName) {
        var value = collection.select(bandName).reduce(reducer)
        var found = collection.map(function (image) {
            return image.updateMask(image.select(bandName).eq(value))
        }).mosaic()
        return Segment(ee.Image(found), dateFormat)
    }


    function map(callback) {
        return ee.ImageCollection(
            segments.map(function (segmentImage) {
                var segment = Segment(ee.Image(segmentImage), dateFormat)
                return callback(segment)
            })
        )
    }


    function evaluate(segment, expressionOrCallback, expressionArgs) {
        return typeof expressionOrCallback === 'function'
            ? expressionOrCallback(segment, segment.toImage())
            : ee.Image().expression(expressionOrCallback, mergeObjects([{ i: segment.toImage() }, expressionArgs || {}]))
    }
}


function chartPoint(args) {
    var image = args.image
    var point = args.point
    var bandName = args.bandName
    var collection = args.collection
    var scale = args.scale || 30
    var dateStep = args.dateStep || 1
    var dateUnit = args.dateUnit || 'month'
    var dateFormat = args.dateFormat === undefined
        ? 0
        : args.dateFormat
    var harmonics = args.harmonics === undefined
        ? 3
        : args.harmonics
    var callback = args.callback || function (chart) { print(chart) }

    var minimalImage = image.select(
        ['tStart', 'tEnd', ee.String(bandName).cat('_coefs')],
        ['tStart', 'tEnd', 'coefs']
    )

    var features = extractSliceFeatures(minimalImage)
    if (collection)
        features = features.merge(extractRawFeatures())
    chartFeatures(features, callback)


    function extractSliceFeatures(image) {
        var segmentsDict = image.reduceRegion({
            reducer: ee.Reducer.first(),
            geometry: point,
            scale: scale
        })
        var tStart = ee.Array(segmentsDict.get('tStart')).toList()
        var tEnd = ee.Array(segmentsDict.get('tEnd')).toList()
        var allCoefs = ee.Array(segmentsDict.get('coefs')).toList()
        var segmentCount = ee.Number(ee.Array(segmentsDict.get('tStart')).toList().size())
        var segmentIndexes = ee.List.sequence(0, segmentCount.subtract(1))
        var features = segmentIndexes.map(function (segmentIndex) {
            return sliceSegment(ee.Number(segmentIndex))
        }).flatten()

        return ee.FeatureCollection(features)


        function sliceSegment(segmentIndex) {
            var start = fromT(tStart.get(segmentIndex))
            var end = fromT(tEnd.get(segmentIndex))
            var coefs = ee.Array(allCoefs.get(segmentIndex)).toList()
            var diff = end.difference(start, dateUnit)

            return ee.List.sequence(0, diff.subtract(1), dateStep).map(function (offset) {
                var date = start.advance(ee.Number(offset), dateUnit)
                var t = toT(date)
                var value = harmonicSlice.sliceNumber(coefs, t, dateFormat, harmonics)

                var segments = ee.List.repeat(ee.Dictionary({}), segmentCount)
                    .set(segmentIndex, ee.Dictionary({ value: value }))
                return ee.Feature(null, {
                    date: date,
                    segments: segments
                })
            })
        }
    }


    function extractRawFeatures() {
        return collection.select(bandName).map(function (image) {
            var bandValue = image.select(bandName).reduceRegion({
                reducer: ee.Reducer.first(),
                geometry: point,
                scale: scale
            }).getNumber(bandName)
            return image
                .set('raw', bandValue)
                .set('date', image.date())
        })
    }


    function chartFeatures(features, callback) {
        features.evaluate(function (features, e) {
            if (e) callback(null, e, args)
            try {
                var segmentCount = 0
                var rows = features.features
                    .map(function (feature) {
                        var row = feature.properties
                        var cells = [
                            { v: new Date(row.date.value) },
                            { v: row.raw }
                        ]
                        if (row.segments) {
                            segmentCount = row.segments.length
                            var segmentCells = row.segments.map(function (o) {
                                return { v: o.value }
                            })
                            cells = cells.concat(segmentCells)
                        }
                        return { c: cells }
                    })

                var cols = [
                    { id: 'date', label: 'Date', type: 'date' },
                    { id: 'raw', label: 'Raw', type: 'number' }
                ]
                var segmentCols = []
                for (var i = 0; i < segmentCount; i++) {
                    segmentCols.push(
                        { id: 'segment' + (i + 1), label: 'Segment ' + (i + 1), type: 'number' }
                    )
                }
                cols = cols.concat(segmentCols)

                var chart = ui.Chart({ cols: cols, rows: rows }, 'LineChart', {
                    pointSize: 0,
                    lineWidth: 1.5,
                    series: {
                        0: { pointSize: 1, lineWidth: 0 },
                    }
                })
                callback(chart, null, args)
            } catch (e) {
                callback(null, e, args)
            }
        })
    }

    function fromT(t) { return dateConversion.fromT(t, dateFormat) }

    function toT(date) { return dateConversion.toT(date, dateFormat) }
}


function mergeObjects(objects) {
    objects = objects || {}
    return objects.reduce(function (acc, o) {
        for (var a in o) { acc[a] = o[a] }
        return acc
    }, {})
}


var dateConversion = {
    toT: function (date, dateFormat) {
        if (date instanceof ee.Date) {
            date = ee.Date(date)
            switch (dateFormat) {
                case J_DAYS:
                    var epochDay = 719529
                    return date.millis().divide(1000).divide(3600).divide(24).add(epochDay)
                case FRACTIONAL_YEARS:
                    return date.get('year').add(date.getFraction('year'))
                case UNIX_TIME_MILLIS:
                    return date.millis()
                default:
                    throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
            }
        } else {
            date = new Date(date)
            switch (dateFormat) {
                case 0: // jdate
                    var epochDay = 719529
                    return date.getTime() / 1000 / 3600 / 24 + epochDay
                case 1: // fractional years
                    var firstOfYear = new Date(Date.UTC(date.getFullYear(), 0, 1, 0, 0, 0))
                    var firstOfNextYear = new Date(Date.UTC(date.getFullYear() + 1, 0, 1, 0, 0, 0))
                    var fraction = (date - firstOfYear) / (firstOfNextYear - firstOfYear)
                    return date.getFullYear() + fraction
                case 2: // unix seconds
                    return date.getTime()
                default:
                    throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
            }
        }
    },


    fromT: function (t, dateFormat) {
        t = ee.Number(t)
        switch (dateFormat) {
            case J_DAYS:
                var epochDay = 719529
                return ee.Date(ee.Number(t.subtract(epochDay).multiply(1000).multiply(3600).multiply(24)))
            case FRACTIONAL_YEARS:
                var firstOfYear = ee.Date.fromYMD(t.floor(), 1, 1)
                var firstOfNextYear = firstOfYear.advance(1, 'year')
                var daysInYear = firstOfNextYear.difference(firstOfYear, 'day')
                var dayOfYear = daysInYear.multiply(t.mod(1)).floor()
                return firstOfYear.advance(dayOfYear, 'day')
            case UNIX_TIME_MILLIS:
                return ee.Date(t)
            default:
                throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
        }
    },

    days: function (t1, t2, dateFormat) {
        var diff = t2.subtract(t1)
        switch (dateFormat) {
            case J_DAYS:
                return diff
            case FRACTIONAL_YEARS:
                return diff.multiply(365).round()
            case UNIX_TIME_MILLIS:
                return diff.divide(1000 * 3600 * 24).round()
            default:
                throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
        }
    }
}


var harmonicSlice = function () {
    return {
        sliceImage: sliceImage,
        sliceNumber: sliceNumber,
        meanImage: meanImage,
        meanArrayImage: meanArrayImage,
        meanNumber: meanNumber,
        phaseAndAmplitude: phaseAndAmplitude
    }

    function sliceImage(coefs, t, dateFormat, harmonics) {
        return ee.ImageCollection(
            slice(coefs, t, dateFormat, harmonics, function (index) {
                return coefs.arrayGet([index])
            })
        )
            .reduce(ee.Reducer.sum())
            .regexpRename('(.*)_coefs_sum', '$1', false)
    }


    function sliceNumber(coefs, t, dateFormat, harmonics) {
        return slice(coefs, t, dateFormat, harmonics, function (index) {
            return ee.Number(coefs.get(index))
        }).reduce(ee.Reducer.sum())
    }


    function meanImage(coefs, tStart, tEnd, dateFormat, harmonics) {
        return mean(coefs, tStart, tEnd, dateFormat, harmonics, function (index) {
            return coefs.arrayGet([index])
        })
            .regexpRename('(.*)_coefs', '$1', false)
    }


    function meanArrayImage(coefs, tStart, tEnd, dateFormat, harmonics) {
        return mean(coefs, tStart, tEnd, dateFormat, harmonics, function (index) {
            return coefs.arraySlice(1, index, index + 1).arrayProject([0])
        })
            .regexpRename('(.*)_coefs', '$1', false)
    }


    function meanNumber(coefs, tStart, tEnd, dateFormat, harmonics) {
        return mean(coefs, tStart, tEnd, dateFormat, harmonics, function (index) {
            return ee.Number(coefs.get(index))
        })
    }

    function slice(coefs, t, dateFormat, harmonics, coefExtractor) {
        dateFormat = dateFormat === undefined
            ? 0
            : dateFormat
        harmonics = harmonics === undefined
            ? 3
            : harmonics
        var omega = getOmega(dateFormat)

        return ee.List([
            c(0)
                .add(c(1).multiply(t)),

            c(2).multiply(t.multiply(omega).cos())
                .add(c(3).multiply(t.multiply(omega).sin())),

            c(4).multiply(t.multiply(omega * 2).cos())
                .add(c(5).multiply(t.multiply(omega * 2).sin())),

            c(6).multiply(t.multiply(omega * 3).cos())
                .add(c(7).multiply(t.multiply(omega * 3).sin()))
        ])
            .slice(0, ee.Number(harmonics).add(1))


        function c(index) {
            return coefExtractor(index)
        }
    }

    function mean(coefs, tStart, tEnd, dateFormat, harmonics, coefExtractor) {
        harmonics = harmonics === undefined
            ? 3
            : harmonics
        var expressions = [
            'c0 + (c1 * (s  + e) / 2)',
            '1/(e - s) * ((c3 * (cos(w * s) - cos(e * w)) - c2 * (sin(w * s) - sin(e * w)))/w - ((s - e) * (c1 * (s + e) + 2 * c0)) / 2)',
            '1/(e - s) * -(c4 * (sin(2 * w * s) - sin(2 * e * w)) - c5 * (cos(2 * w * s) - cos(2 * e * w)) + 2 * c2 * (sin(w * s) - sin(e * w)) - 2 * c3 * (cos(w * s) - cos(e * w)) + w * (s - e) * (c1 * (s + e) + 2 * c0)) / (2 * w)',
            '1/(e - s) * -(2 * c6 * (sin(3 * w * s) - sin(3 * e * w)) - 2 * c7 * (cos(3 * w * s) - cos(3 * e * w)) + 3 * (c4 * (sin(2 * w * s) - sin(2 * e * w)) + w * (s - e) * (c1 * (s + e) + 2 * c0)) - 3 * c5 * (cos(2 * w * s) - cos(2 * e * w)) + 6 * c2 * (sin(w * s) - sin(e * w)) - 6 * c3 * (cos(w * s) - cos(e * w)))/(6 * w)'
        ]
        return ee.Image().expression(expressions[harmonics], {
            s: tStart,
            e: tEnd,
            w: getOmega(dateFormat),
            c0: coefExtractor(0),
            c1: coefExtractor(1),
            c2: coefExtractor(2),
            c3: coefExtractor(3),
            c4: coefExtractor(4),
            c5: coefExtractor(5),
            c6: coefExtractor(6),
            c7: coefExtractor(7),
        })
    }

    function getOmega(dateFormat) {
        switch (dateFormat) {
            case 0: // jdate
                return 2.0 * Math.PI / 365.25
            case 1: // fractional years
                return 2.0 * Math.PI
            case 2: // unix seconds
                return 2.0 * Math.PI / (60 * 60 * 24 * 365.25)
            default:
                throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
        }
    }

    function phaseAndAmplitude(coefs, harmonics) {
        if (harmonics > 0)
            return ee.ImageCollection(
                sequence(1, harmonics)
                    .map(function (harmonic) {
                        return coefsToPhase(coefs, harmonic).addBands(
                            coefsToAmplitude(coefs, harmonic)
                        )
                    })
            )
                .toBands()
                .regexpRename('.*?_(.*)', '$1', false)
        else
            return ee.Image([])
    }
}()


function sequence(start, end) {
    return Array.apply(start, Array(end)).map(function (_, i) { return i + start })
}


function coefsToPhase(coefs, harmonic) {
    var harmonic = harmonic || 1
    return coefs.arrayGet([ee.Number(harmonic).multiply(2)])
        .atan2(coefs.arrayGet([ee.Number(harmonic).multiply(2).add(1)]))
        .float()
        .regexpRename('(.*)_coefs', '$1_phase_' + harmonic, false)
}


function coefsToAmplitude(coefs, harmonic) {
    return coefs.arrayGet([ee.Number(harmonic).multiply(2)])
        .hypot(coefs.arrayGet([ee.Number(harmonic).multiply(2).add(1)]))
        .float()
        .regexpRename('(.*)_coefs', '$1_amplitude_' + harmonic, false)
}


function sliceBandNames(coefs, harmonics) {
    function bandNames(postfix) {
        return coefs.regexpRename('(.*)_coefs', '$1' + postfix, true).bandNames()
    }
    var value = bandNames('')
    var rmse = bandNames('_rmse')
    var magnitude = bandNames('_magnitude')
    var breakConfidence = bandNames('_breakConfidence')
    var intercept = bandNames('_intercept')
    var slope = bandNames('_slope')
    var phases = sequence(1, harmonics).map(function (i) {
        return bandNames('_phase_' + i)
    })
    var amplitudes = sequence(1, harmonics).map(function (i) {
        return bandNames('_amplitude_' + i)
    })
    return ee.List([
        'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
        value, rmse, magnitude, breakConfidence, intercept, slope, phases, amplitudes
    ]).flatten()
}


exports = {
    Segments: Segments,
    Segment: Segment,
    Classification: Classification,
    chartPoint: chartPoint,
    toT: dateConversion.toT,
    fromT: dateConversion.fromT,
}

module.exports = {
    Segments,
    Segment
}
