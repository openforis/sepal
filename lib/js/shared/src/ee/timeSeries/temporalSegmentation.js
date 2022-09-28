const ee = require('sepal/ee')

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

function Segments(segmentsImage, dateFormat, maxSegments) {
    segmentsImage = updateImageMask(segmentsImage)
    dateFormat = dateFormat === undefined ? 0 : dateFormat
    maxSegments = maxSegments ? maxSegments : 50

    return {
        dateRange,
        filterDate,
        toFixedIntervals,
        find,
        findByDate,
        first,
        last,
        min,
        max,
        segmentIndex,
        toT,
        fromT,
        count,
        interpolate,
        transitions,
        sample,
        map,
        toImage,
        toCollection,
        dateFormat: function () { return dateFormat }
    }

    function dateRange(fromDate, toDate) {
        if (!fromDate || !toDate)
            throw new Error('Segments.dateRange(fromDate, toDate): fromDate and toDate are required')
        return DateRange(this, fromDate, toDate)
    }

    function filterDate(fromDate, toDate) {
        const fromIndex = segmentIndex(ee.Date(fromDate), 'next')
        const toIndex = segmentIndex(ee.Date(toDate), 'previous')
        return Segments(segmentsImage.arraySlice(0, fromIndex, toIndex.add(1)), dateFormat, maxSegments)
    }

    function toFixedIntervals(fromDate, toDate, delta, unit) {
        fromDate = ee.Date(fromDate)
        toDate = ee.Date(toDate)
        const difference = toDate.difference(fromDate, unit).ceil()
        const intervalsImages = ee.List.sequence(0, difference.subtract(1), delta)
            .map(function (advance) {
                const startDate = fromDate.advance(ee.Number(advance), unit)
                const endDate = startDate.advance(delta, unit)
                const intervalImage = filterDate(startDate, endDate).toImage()
                const tStart = intervalImage.select('tStart').max(toT(startDate))
                const tEnd = intervalImage.select('tEnd').min(toT(endDate))
                const tBreak = intervalImage.select('tEnd').lte(toT(endDate)).multiply(intervalImage.select('tBreak'))
                    .rename('tBreak')
                return intervalImage
                    .addBands(tStart, null, true)
                    .addBands(tEnd, null, true)
                    .addBands(tBreak, null, true)
            })
        const head = ee.Image(intervalsImages.get(0))
        const tail = ee.List(intervalsImages.slice(1))
        const intervalsImage = ee.Image(
            tail.iterate(function (image, acc) {
                return ee.Image(acc).arrayCat(ee.Image(image), 0)
            }, head)
        )
        return Segments(intervalsImage, dateFormat, maxSegments)
    }

    function toArrayImage(collection) {
        const arrayImages = collection
            .map(incrementDimensions)
            .toList(maxSegments)
        const emptyArrayImage = ee.Image(arrayImages.get(0)).arraySlice(0, 0, 0)
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
            const dimension = getDimension(image)
            const updatedImage = image
                .toArray(dimension)
                .rename(image.bandNames())
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
            const bandName = ee.String(image.bandNames().get(0))
            return bandName.match('.*_coefs').size().gt(0) // Returns 0 if not .*_coefs, otherwise 1, which match the dimension
        }
    }

    function map(algorithm) {
        const collection = toCollection().map(function (image) {
            return algorithm(Segment(image, dateFormat))
        })
        return toArrayImage(collection)
    }

    // function map(algorithm) {
    //   const collection = toCollection().map(function (image) {
    //     return algorithm(Segment(image, dateFormat))
    //   })
    //   const updatedSegmentsImage = toArrayImage(collection)
    //   return Segments(updatedSegmentsImage, dateFormat, maxSegments)
    // }

    // function addBands(expressionOrCallback, rename, overwrite) {
    //   return map(function (segment) {
    //     const imageToAdd = evaluate(segment, expressionOrCallback)
    //       if (rename)
    //         imageToAdd = imageToAdd.rename(rename)
    //     return segment.toImage().addBands(imageToAdd, null, overwrite)
    //   })
    // }

    // function updateMask(expressionOrCallback, expressionArgs) {
    //   return map(function (segment) {
    //     return segment.toImage()
    //       .updateMask(evaluate(segment, expressionOrCallback, expressionArgs))
    //   })
    // }

    // function evaluate(segment, expressionOrCallback, expressionArgs) {
    //   return typeof expressionOrCallback === 'function'
    //     ? expressionOrCallback(segment, segment.toImage())
    //     : ee.Image().expression(expressionOrCallback, mergeObjects([{i: segment.toImage()}, expressionArgs]))
    // }

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
        let value = segmentsImage.select(bandName)
            .arrayReduce(reducer, [0])
        value = value.updateMask(value.arrayLength(0))
            .arrayGet([0])
            .float()
        const segmentsBand = segmentsImage.select(bandName).float()
        let segmentIndex = getSegmentIndexes()
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
        const t = ee.Image(toT(date))
        const segmentIndexes = getSegmentIndexes()

        let masked

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
            const previousDistance = segmentsImage.select('tStart').subtract(t).abs()
                .arrayReduce(ee.Reducer.min(), [0]).arrayGet([0])
            const nextDistance = segmentsImage.select('tEnd').subtract(t).abs()
                .arrayReduce(ee.Reducer.min(), [0]).arrayGet([0])
            masked = getPrevious().where(nextDistance.gt(previousDistance), getNext())
        } else if (strategy === 'previous') {
            masked = getPrevious()
        } else if (strategy === 'next') {
            masked = getNext()
        } else {
            throw new Error(`Unsupported strategy: ${strategy}. Allows mask (default), closest, previous, and next`)
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

    function interpolate(date, harmonics = 3) {
        const startSegment = findByDate(date, 'previous')
        const endSegment = findByDate(date, 'next')
        const tStart = startSegment.toImage('tEnd')
        const tBreak = startSegment.toImage('tBreak')
        const tEnd = endSegment.toImage('tStart')
        const startValue = startSegment.endSlice(0)
        const endValue = endSegment.startSlice(0)
        const slope = endValue.subtract(startValue).divide(tEnd.subtract(tStart))
        const intercept = startValue.subtract(slope.multiply(tStart))
        const t = ee.Image(toT(date))
        const tEndWeight = t.subtract(tStart).divide(tEnd.subtract(tStart))
        const tStartWeight = ee.Image(1).subtract(tEndWeight)
        const startCoefs = startSegment.toImage('.*_coefs')
        const endCoefs = endSegment.toImage('.*_coefs')
        const interceptCoefs = intercept.multiply(ee.Image(ee.Array([1, 0, 0, 0, 0, 0, 0, 0])))
        const slopeCoefs = slope.multiply(ee.Image(ee.Array([0, 1, 0, 0, 0, 0, 0, 0])))
        const weightedCoefs = startCoefs
            .multiply(tStartWeight).add(
                endCoefs.multiply(tEndWeight)
            )
        const harmonicCoefs = weightedCoefs.multiply(ee.Image(ee.Array([0, 0, 1, 1, 1, 1, 1, 1])))
        const coefs = interceptCoefs.add(slopeCoefs).add(harmonicCoefs)
            .regexpRename('(.*)', '$1_coefs', false)
        const interpolated = harmonicSlice.sliceImage(coefs, t, dateFormat, harmonics)
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

        const segment = findByDate(date, 'mask')
        const slice = segment.slice({harmonics})
            .addBands(segment.toImage('.*_coefs').arrayGet([0])
                .regexpRename('(.*)_coefs', '$1_intercept', false)
            )
            .addBands(segment.toImage('.*_coefs').arrayGet([1])
                .regexpRename('(.*)_coefs', '$1_slope', false)
            )
            .addBands(harmonicSlice.phaseAndAmplitude(segment.toImage('.*_coefs'), harmonics))
            .addBands(segment.toImage('.*_rmse'))
            .addBands(segment.toImage('numObs'))
        const magnitude = startSegment.toImage('.*_magnitude').regexpRename('(.*)_magnitude', '$1', false)
        const rmse = startSegment.toImage('.*_rmse').regexpRename('(.*)_rmse', '$1', false)
        const breakConfidence = magnitude.divide(rmse).regexpRename('(.*)', '$1_breakConfidence', false)
        const result = interpolated
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
        const samples = ee.FeatureCollection(features.iterate(function (feature, features) {
            feature = ee.Feature(feature)
            const segment = findByDate(ee.Date(feature.get('date')))
            const imageToSample = mapSegment(segment, segment.toImage())

            const sample = imageToSample.sample({
                region: feature.geometry(),
                scale,
                tileScale: 16
            })
                .map(function (sample) {
                    return sample.copyProperties({source: feature, exclude: ['date']})
                })
            return ee.FeatureCollection(features).merge(sample)
        }, ee.FeatureCollection([])))
        return samples
            .set('band_order', samples.first().propertyNames().slice(1)) // inputProperties default in Classifier.train()
    }

    function toImage(selector) {
        return selector === undefined
            ? segmentsImage
            : segmentsImage.select(selector)
    }

    function toCollection() {
        const segmentCount = count()
        return ee.ImageCollection(
            ee.List.sequence(0, ee.Number(maxSegments).subtract(1)).iterate(function (i, acc) {
                const image = ee.Image([]).set('imageIndex', i)
                return ee.ImageCollection(acc).merge(ee.ImageCollection([image]))
            }, ee.ImageCollection([]))
        )
            .map(function (image) {
                const imageIndex = ee.Image(ee.Number(image.get('imageIndex')))
                const segmentIndex = segmentCount.subtract(1).min(imageIndex)
                return getSegmentImage(segmentIndex)
                    .updateMask(imageIndex.lt(segmentCount))
            })
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
        const mask = getSegmentIndexes().eq(segmentIndex.unmask(-1))
        let image1D = segmentsImage.select(bandNames1D())
            .arrayMask(mask)
        image1D = image1D.mask(image1D.select(0).arrayLength(0).unmask(0))
            .arrayProject([0])
            .arrayGet([0])

        let image2D = segmentsImage.select(bandNames2D())
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
}

function DateRange(segments, fromDate, toDate) {
    const dateFormat = segments.dateFormat()
    return {
        mean,
        pickBreakpoint
    }

    function pickBreakpoint({
        breakAnalysisBand,
        breakMagnitudeDirection = 'ANY',
        minBreakConfidence = 0,
        breakSelection = 'FIRST',
        skipBreakInLastSegment = false
    }) {
        const tEndMax = skipBreakInLastSegment ? segments.last().toImage('tEnd') : Number.MAX_SAFE_INTEGER
        const filteredSegments = segments.filterDate(fromDate, toDate)
        const segment = findSegment()
        const segmentImage = segment.toImage(['tBreak', 'changeProb', '.*_magnitude', '.*_rmse'])
        const breakConfidence = segmentImage.select('.*_magnitude').abs()
            .divide(segmentImage.select('.*_rmse'))
            .regexpRename('(.*)_magnitude', '$1_breakConfidence')
        return segmentImage
            .select(['tBreak', 'changeProb', '.*_magnitude'])
            .addBands(breakConfidence)
            .unmask(0)
            .updateMask(filteredSegments.toImage('tStart').mask())

        function findSegment() {
            const segmentQuery = (breakAnalysisBand
                ? filteredSegments.find().addBands(
                    `abs(i.${breakAnalysisBand}_magnitude) / i.${breakAnalysisBand}_rmse`, `${breakAnalysisBand}_breakConfidence`
                )
                : filteredSegments.find()
            ).updateMask(function (segment, image) {
                const inDateRange = ee.Image().expression('tBreak >= start and tBreak < end and tEnd < tEndMax', {
                    tEnd: image.select('tEnd'),
                    tBreak: image.select('tBreak'),
                    start: filteredSegments.toT(ee.Date(fromDate)),
                    end: filteredSegments.toT(ee.Date(toDate)),
                    tEndMax
                })
                if (minBreakConfidence && breakAnalysisBand) {
                    const overMinConfidence = image.select(`${breakAnalysisBand}_breakConfidence`)
                        .gte(minBreakConfidence)
                    const magnitude = image.select(`${breakAnalysisBand}_magnitude`)
                    const correctDirection = breakMagnitudeDirection === 'INCREASE'
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
            const effectiveBreakSelection = breakAnalysisBand
                ? breakSelection
                : breakSelection === 'LAST'
                    ? 'LAST'
                    : 'FIRST'
            return pick(segmentQuery, effectiveBreakSelection)
        }

        function pick(segmentQuery, breakSelection) {
            switch(breakSelection) {
            case 'FIRST': return segmentQuery.first()
            case 'LAST': return segmentQuery.last()
            case 'MAGNITUDE': return segmentQuery.max(`${breakAnalysisBand}_magnitude`)
            case 'CONFIDENCE': return segmentQuery.max(`${breakAnalysisBand}_breakConfidence`)
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
                    .regexpRename('(.*)_coefs', `$1_phase_${harmonic}`, false)
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
                    .regexpRename('(.*)_coefs', `$1_amplitude_${harmonic}`, false)
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
    const defaultT = toT(defaultDate) || segmentImage.expression('(i.tStart + i.tEnd) / 2', {i: segmentImage})

    return {
        slice,
        startSlice,
        endSlice,
        middleSlice,
        fit: slice, // deprecated, use slice() instead
        startFit: startSlice, // deprecated, use startSlice() instead
        middleFit: middleSlice, // deprecated, use middleSlice() instead
        endFit: endSlice, // deprecated, use startSlice() instead
        mean,
        toT,
        fromT,
        coefs,
        intercept,
        slope,
        phase,
        amplitude,
        toImage,
        dateFormat: function () { return dateFormat }
    }

    function slice(options) {
        const defaultOptions = {
            t: defaultT,
            harmonics: 3,
            extrapolateMaxDays: 0,
            extrapolateMaxFraction: 0,
            strategy: 'mask'
        }
        options = mergeObjects([defaultOptions, options])

        const t = ee.Image(options.date ? toT(options.date) : options.t)
        const harmonics = options.harmonics
        const tStart = segmentImage.select('tStart')
        const tEnd = segmentImage.select('tEnd')

        const daysFromStart = dateConversion.days(t, tStart, dateFormat)
        const daysFromEnd = dateConversion.days(tEnd, t, dateFormat)

        const coefs = segmentImage.select('.*_coefs')
        if (options.strategy !== 'closest') {
            let extrapolateMaxDays = options.extrapolateMaxFraction
                ? dateConversion.days(tStart, tEnd, dateFormat).multiply(options.extrapolateMaxFraction).round()
                : ee.Image(options.extrapolateMaxDays)
            extrapolateMaxDays = extrapolateMaxDays.where(extrapolateMaxDays.lt(0), ee.Image(Number.MAX_SAFE_INTEGER))

            const daysFromSegment = daysFromStart
                .max(daysFromEnd)
                .max(0)

            return harmonicSlice.sliceImage(coefs, t, dateFormat, harmonics)
                .updateMask(extrapolateMaxDays.gte(daysFromSegment))
        } else {
            const tUsed = t
                .where(daysFromStart.gt(0), tStart)
                .where(daysFromEnd.gt(0), tEnd)
            return harmonicSlice.sliceImage(coefs, tUsed, dateFormat, harmonics)
        }
    }

    function startSlice(harmonics) {
        return slice({t: segmentImage.select('tStart'), harmonics})
    }

    function endSlice(harmonics) {
        return slice({t: segmentImage.select('tEnd'), harmonics})
    }

    function middleSlice(harmonics) {
        const t = segmentImage.expression('i.tStart + (i.tEnd - i.tStart) / 2', {i: segmentImage})
        return slice({t, harmonics})
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
                    .rename(ee.String(bandName).cat(`_coef_${coefIndex}`))
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

    function phase(harmonic = 1) {
        return coefsToPhase(segmentImage.select('.*_coefs'), harmonic)
    }

    function amplitude(harmonic = 1) {
        return coefsToAmplitude(segmentImage.select('.*_coefs'), harmonic)
    }

    function toImage(selector) {
        return selector === undefined
            ? segmentImage
            : segmentImage.select(selector)
    }
}

function Transitions(segments) {
    const image = segments.toImage()
    const from = image.arraySlice(0, 0, -2)
    const to = image.arraySlice(0, 1, -1)
    const transitionImage = from.select('tStart')
        .addBands(from.select('tEnd'))
        .addBands(from.select('tBreak'))
        .addBands(from.regexpRename('(.*)', 'from_$1', false))
        .addBands(to.regexpRename('(.*)', 'to_$1', false))
    return Segments(transitionImage, segments.dateFormat())
}

function Find(collection, dateFormat, maxSegments) {
    const segments = collection.toList(50)
    return {
        addBands,
        updateMask,
        first,
        last,
        min,
        max
    }

    function addBands(expressionOrCallback, rename, replace) {
        const updatedCollection = map(function (segment) {
            let imageToAdd = evaluate(segment, expressionOrCallback)
            if (rename)
                imageToAdd = imageToAdd.rename(rename)
            return segment.toImage().addBands(imageToAdd, null, replace)
        })
        return Find(updatedCollection, dateFormat, maxSegments)
    }

    function updateMask(expressionOrCallback, expressionArgs) {
        const updatedCollection = map(function (segment) {
            return segment.toImage().updateMask(evaluate(segment, expressionOrCallback, expressionArgs))
        })
        return Find(updatedCollection, dateFormat, maxSegments)
    }

    function first() {
        const image = collection.reduce(ee.Reducer.firstNonNull())
            .regexpRename('(.*)_first', '$1', false)
        return Segment(image, dateFormat)
    }

    function last() {
        const image = collection.reduce(ee.Reducer.lastNonNull())
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
        const value = collection.select(bandName).reduce(reducer)
        const found = ee.mosaic(
            collection.map(function (image) {
                return image.updateMask(image.select(bandName).eq(value))
            })
        )
        return Segment(ee.Image(found), dateFormat)
    }

    function map(callback) {
        return ee.ImageCollection(
            segments.map(function (segmentImage) {
                const segment = Segment(ee.Image(segmentImage), dateFormat)
                return callback(segment)
            })
        )
    }

    function evaluate(segment, expressionOrCallback, expressionArgs) {
        return typeof expressionOrCallback === 'function'
            ? expressionOrCallback(segment, segment.toImage())
            : ee.Image().expression(expressionOrCallback, mergeObjects([{i: segment.toImage()}, expressionArgs || {}]))
    }
}

function mergeObjects(objects) {
    objects = objects || {}
    return objects.reduce(function (acc, o) {
        for (let a in o) { acc[a] = o[a] }
        return acc
    }, {})
}

const dateConversion = {
    toT: function (date, dateFormat) {
        if (date instanceof ee.Date) {
            date = ee.Date(date)
            switch(dateFormat) {
            case J_DAYS:
                return date.millis().divide(1000).divide(3600).divide(24).add(719529)
            case FRACTIONAL_YEARS:
                return date.get('year').add(date.getFraction('year'))
            case UNIX_TIME_MILLIS:
                return date.millis()
            default:
                throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
            }
        } else {
            const fractionalYears = () => {
                const firstOfYear = new Date(Date.UTC(date.getFullYear(), 0, 1, 0, 0, 0))
                const firstOfNextYear = new Date(Date.UTC(date.getFullYear() + 1, 0, 1, 0, 0, 0))
                const fraction = (date - firstOfYear) / (firstOfNextYear - firstOfYear)
                return date.getFullYear() + fraction
            }
            date = new Date(date)
            switch(dateFormat) {
            case 0: // jdate
                return date.getTime() / 1000 / 3600 / 24 + 719529
            case 1: // fractional years
                return fractionalYears()
            case 2: // unix seconds
                return date.getTime()
            default:
                throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
            }
        }
    },

    fromT: function (t, dateFormat) {
        t = ee.Number(t)
        const jDays = () => {
            const epochDay = 719529
            return ee.Date(ee.Number(t.subtract(epochDay).multiply(1000).multiply(3600).multiply(24)))
        }
        const fractionalYears = () => {
            const firstOfYear = ee.Date.fromYMD(t.floor(), 1, 1)
            const firstOfNextYear = firstOfYear.advance(1, 'year')
            const daysInYear = firstOfNextYear.difference(firstOfYear, 'day')
            const dayOfYear = daysInYear.multiply(t.mod(1)).floor()
            return firstOfYear.advance(dayOfYear, 'day')
        }
        switch(dateFormat) {
        case J_DAYS:
            return jDays()
        case FRACTIONAL_YEARS:
            return fractionalYears()
        case UNIX_TIME_MILLIS:
            return ee.Date(t)
        default:
            throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
        }
    },

    days: function (t1, t2, dateFormat) {
        const diff = t2.subtract(t1)
        switch(dateFormat) {
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

const harmonicSlice = function() {
    return {
        sliceImage,
        sliceNumber,
        meanImage,
        meanArrayImage,
        meanNumber,
        phaseAndAmplitude
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
        var bandNames = coefs.bandNames().map(function (band) {
            return ee.String(band).replace('_coefs', '')
        })
        return mean(coefs, tStart, tEnd, dateFormat, harmonics, function (index) {
            return coefs.arrayGet([index])
        }).rename(bandNames)
    }

    function meanArrayImage(coefs, tStart, tEnd, dateFormat, harmonics) {
        var bandNames = coefs.bandNames().map(function (band) {
            return ee.String(band).replace('_coefs', '')
        })
        return mean(coefs, tStart, tEnd, dateFormat, harmonics, function (index) {
            return coefs.arraySlice(1, index, index + 1).arrayProject([0])
        }).rename(bandNames)
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
        const expressions = [
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
        switch(dateFormat) {
        case 0: // jdate
            return 2.0 * Math.PI / 365.25
        case 1: // fractional years
            return 2.0 * Math.PI
        case 2: // unix seconds
            return 2.0 * Math.PI * 60 * 60 * 24 * 365.25
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
    return Array.apply(start, Array(end)).map(function(_, i) { return i + start })
}

function coefsToPhase(coefs, harmonic = 1) {
    return coefs.arrayGet([ee.Number(harmonic).multiply(2)])
        .atan2(coefs.arrayGet([ee.Number(harmonic).multiply(2).add(1)]))
        .float()
        .regexpRename('(.*)_coefs', `$1_phase_${harmonic}`, false)
}

function coefsToAmplitude(coefs, harmonic) {
    return coefs.arrayGet([ee.Number(harmonic).multiply(2)])
        .hypot(coefs.arrayGet([ee.Number(harmonic).multiply(2).add(1)]))
        .float()
        .regexpRename('(.*)_coefs', `$1_amplitude_${harmonic}`, false)
}

function sliceBandNames(coefs, harmonics) {
    function bandNames(postfix) {
        return coefs.regexpRename('(.*)_coefs', `$1${postfix}`, true).bandNames()
    }

    const value = bandNames('')
    const rmse = bandNames('_rmse')
    const magnitude = bandNames('_magnitude')
    const breakConfidence = bandNames('_breakConfidence')
    const intercept = bandNames('_intercept')
    const slope = bandNames('_slope')
    const phases = sequence(1, harmonics).map(function (i) {
        return bandNames(`_phase_${i}`)
    })
    const amplitudes = sequence(1, harmonics).map(function (i) {
        return bandNames(`_amplitude_${i}`)
    })
    return ee.List([
        'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
        value, rmse, magnitude, breakConfidence, intercept, slope, phases, amplitudes
    ]).flatten()
}

module.exports = {
    Segments,
    Segment
}
