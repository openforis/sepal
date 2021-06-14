const ee = require('ee')

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

function Segments(segmentsImage, dateFormat, maxSegments) {
    segmentsImage = updateImageMask(segmentsImage)
    dateFormat = dateFormat === undefined ? 0 : dateFormat
    maxSegments = maxSegments ? maxSegments : 50

    return {
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
        classify,
        map,
        toImage,
        toCollection,
        toAsset,
        combinePairwise,
        dateFormat: function () {
            return dateFormat
        }
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
            const unmaskValue = createEmptyArrayImage(dimension)
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

    function interpolate(date, harmonics) {
        harmonics = harmonics === undefined ? 3 : harmonics
        const startSegment = findByDate(date, 'previous')
        const endSegment = findByDate(date, 'next')
        const tStart = startSegment.toImage('tEnd')
        const tEnd = endSegment.toImage('tStart')
        const t = ee.Image(toT(date))
        const tEndWeight = t.subtract(tStart).divide(tEnd.subtract(tStart))
        const tStartWeight = ee.Image(1).subtract(tEndWeight)
        const startCoefs = startSegment.toImage('.*_coefs')
        const endCoefs = endSegment.toImage('.*_coefs')
        const coefs = startCoefs
            .multiply(tStartWeight).add(
                endCoefs.multiply(tEndWeight)
            )
        const interpolated = harmonicFit.fitImage(coefs, t, dateFormat, harmonics)
            .addBands(coefs.arrayGet([1]).regexpRename('(.*)', '$1_intercept', false))
            .addBands(coefs.arrayGet([0]).regexpRename('(.*)', '$1_slope', false))
            .addBands(harmonicFit.phaseAndAmplitude(coefs, 3))
            .addBands(
                startSegment.toImage('.*_rmse').multiply(tStartWeight).pow(2)
                    .add(endSegment.toImage('.*_rmse').multiply(tEndWeight).pow(2)).sqrt()
            )

        const segment = findByDate(date, 'mask')
        const fit = segment.fit({harmonics})
            .addBands(segment.toImage('.*_coefs').arrayGet([0])
                .regexpRename('(.*)_coefs', '$1_intercept', false)
            )
            .addBands(segment.toImage('.*_coefs').arrayGet([1])
                .regexpRename('(.*)_coefs', '$1_slope', false)
            )
            .addBands(harmonicFit.phaseAndAmplitude(segment.toImage('.*_coefs'), 3))
            .addBands(segment.toImage('.*_rmse'))
        const startBands = startSegment.toImage()
        return interpolated
            .where(fit.mask(), fit)
            .rename(fit.bandNames())
            .addBands(startBands.select('.*_magnitude'))
            .addBands(startBands.select('tStart'))
            .addBands(startBands.select('tEnd'))
            .addBands(startBands.select('tBreak'))
            .addBands(startBands.select('numObs'))
            .addBands(startBands.select('changeProb'))
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
                scale
            })
                .map(function (sample) {
                    return sample.copyProperties({source: feature, exclude: ['date']})
                })
            return ee.FeatureCollection(features).merge(sample)
        }, ee.FeatureCollection([])))
        return samples
            .set('band_order', samples.first().propertyNames().slice(1)) // inputProperties default in Classifier.train()
    }

    function classify(classifier, mapSegment, bandName) {
        bandName = bandName || 'type'
        const classificationsImage = map(function (segment) {
            const imageToClassify = mapSegment(segment, segment.toImage())
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
        const segmentCount = count()
        const imageCollection = ee.ImageCollection(
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
        return imageCollection
    }

    function toAsset(exportArgs) {
        Export.image.toAsset(mergeObjects([
            {
                scale: 30,
                crs: segmentsImage.projection().crs(),
                pyramidingPolicy: {'.default': 'sample'}
            },
            exportArgs,
            {image: segmentsImage}
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

    function combinePairwise(image, algorithm, suffix) {
        suffix = suffix || ''
        return ee.Image(image.bandNames().iterate(function (b1, accImage) {
            b1 = ee.String(b1)
            accImage = ee.Image(accImage)
            const img1 = image.select(b1).rename('img1')
            const i1 = image.bandNames().indexOf(b1)
            const combinations = ee.Image(image.bandNames().slice(i1.add(1)).iterate(function (b2, accImage) {
                b2 = ee.String(b2)
                accImage = ee.Image(accImage)
                const img2 = image.select(b2).rename('img2')
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
                {s: segment}).rename('densityObs')
            )
            .addBands(nd)
    }
}

function Segment(segmentImage, dateFormat, defaultDate) {
    const defaultT = toT(defaultDate) || segmentImage.expression('(i.tStart + i.tEnd) / 2', {i: segmentImage})

    return {
        fit,
        startFit,
        middleFit,
        endFit,
        mean,
        toT,
        fromT,
        coefs,
        intercept,
        slope,
        phase,
        amplitude,
        toImage,
        dateFormat: function () {
            return dateFormat
        }
    }

    function fit(options) {
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

            return harmonicFit.fitImage(coefs, t, dateFormat, harmonics)
                .updateMask(extrapolateMaxDays.gte(daysFromSegment))
        } else {
            const tUsed = t
                .where(daysFromStart.gt(0), tStart)
                .where(daysFromEnd.gt(0), tEnd)
            return harmonicFit.fitImage(coefs, tUsed, dateFormat, harmonics)
        }
    }

    function startFit(harmonics) {
        return fit({t: segmentImage.select('tStart'), harmonics})
    }

    function endFit(harmonics) {
        return fit({t: segmentImage.select('tEnd'), harmonics})
    }

    function middleFit(harmonics) {
        const t = segmentImage.expression('i.tStart + (i.tEnd - i.tStart) / 2', {i: segmentImage})
        return fit({t, harmonics})
    }

    function mean(harmonics) {
        return harmonicFit.meanImage(
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

    function phase(harmonic) {
        harmonic = harmonic || 1
        return coefsToPhase(segmentImage.select('.*_coefs'), harmonic)
    }

    function amplitude(harmonic) {
        harmonic = harmonic || 1
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
        {toAsset}
    ])

    function toAsset(exportArgs) {
        const projection = segments.toImage().projection()
        Export.image.toAsset(mergeObjects([
            {
                scale: 30,
                crs: projection.crs(),
                pyramidingPolicy: {'.default': 'sample'}
            },
            exportArgs,
            {image: classificationsImage}
        ]))
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

    function addBandsReplace(expressionOrCallback, rename) {
        return addBands(expressionOrCallback, rename, true)
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
        const found = collection.map(function (image) {
            return image.updateMask(image.select(bandName).eq(value))
        }).mosaic()
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

function chartPoint(args) {
    const image = args.image
    const point = args.point
    const bandName = args.bandName
    const collection = args.collection
    const scale = args.scale || 30
    const dateStep = args.dateStep || 1
    const dateUnit = args.dateUnit || 'month'
    const dateFormat = args.dateFormat === undefined
        ? 0
        : args.dateFormat
    const harmonics = args.harmonics === undefined
        ? 3
        : args.harmonics
    const callback = args.callback || function (chart) {
        print(chart)
    }

    const minimalImage = image.select(
        ['tStart', 'tEnd', ee.String(bandName).cat('_coefs')],
        ['tStart', 'tEnd', 'coefs']
    )

    let features = extractFitFeatures(minimalImage)
    if (collection)
        features = features.merge(extractRawFeatures())
    chartFeatures(features, callback)

    function extractFitFeatures(image) {
        const segmentsDict = image.reduceRegion({
            reducer: ee.Reducer.first(),
            geometry: point,
            scale
        })

        const tStart = ee.Array(segmentsDict.get('tStart')).toList()
        const tEnd = ee.Array(segmentsDict.get('tEnd')).toList()
        const allCoefs = ee.Array(segmentsDict.get('coefs')).toList()
        const segmentCount = ee.Number(ee.Array(segmentsDict.get('tStart')).toList().size())
        const segmentIndexes = ee.List.sequence(0, segmentCount.subtract(1))

        const features = segmentIndexes.map(function (segmentIndex) {
            return fitSegment(ee.Number(segmentIndex))
        }).flatten()

        return ee.FeatureCollection(features)

        function fitSegment(segmentIndex) {
            const start = fromT(tStart.get(segmentIndex))
            const end = fromT(tEnd.get(segmentIndex))
            const coefs = ee.Array(allCoefs.get(segmentIndex)).toList()
            const diff = end.difference(start, dateUnit)

            return ee.List.sequence(0, diff.subtract(1), dateStep).map(function (offset) {
                const date = start.advance(ee.Number(offset), dateUnit)
                const t = toT(date)
                const value = harmonicFit.fitNumber(coefs, t, dateFormat, harmonics)

                const segments = ee.List.repeat(ee.Dictionary({}), segmentCount)
                    .set(segmentIndex, ee.Dictionary({value}))
                return ee.Feature(null, {
                    date,
                    segments
                })
            })
        }
    }

    function extractRawFeatures() {
        return collection.select(bandName).map(function (image) {
            const bandValue = image.select(bandName).reduceRegion({
                reducer: ee.Reducer.first(),
                geometry: point,
                scale
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
                let segmentCount = 0
                const rows = features.features
                    .map(function (feature) {
                        const row = feature.properties
                        let cells = [
                            {v: new Date(row.date.value)},
                            {v: row.raw}
                        ]
                        if (row.segments) {
                            segmentCount = row.segments.length
                            const segmentCells = row.segments.map(function (o) {
                                return {v: o.value}
                            })
                            cells = cells.concat(segmentCells)
                        }
                        return {c: cells}
                    })

                let cols = [
                    {id: 'date', label: 'Date', type: 'date'},
                    {id: 'raw', label: 'Raw', type: 'number'}
                ]
                const segmentCols = []
                for (let i = 0; i < segmentCount; i++) {
                    segmentCols.push(
                        {id: `segment${i + 1}`, label: `Segment ${i + 1}`, type: 'number'}
                    )
                }
                cols = cols.concat(segmentCols)

                const chart = ui.Chart({cols, rows}, 'LineChart', {
                    pointSize: 0,
                    lineWidth: 1.5,
                    series: {
                        0: {pointSize: 1, lineWidth: 0}
                    }
                })
                callback(chart, null, args)
            } catch (e) {
                callback(null, error, args)
            }
        })
    }

    function fromT(t) {
        return dateConversion.fromT(t, dateFormat)
    }

    function toT(date) {
        return dateConversion.toT(date, dateFormat)
    }
}

function mergeObjects(objects) {
    objects = objects || {}
    return objects.reduce(function (acc, o) {
        for (const a in o) {
            acc[a] = o[a]
        }
        return acc
    }, {})
}

const dateConversion = {
    toT: function (date, dateFormat) {
        if (date instanceof ee.Date) {
            date = ee.Date(date)
            switch (dateFormat) {
            case J_DAYS:
                const epochDay = 719529
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
                const epochDay = 719529
                return date.getTime() / 1000 / 3600 / 24 + epochDay
            case 1: // fractional years
                const firstOfYear = new Date(Date.UTC(date.getFullYear(), 0, 1, 0, 0, 0))
                const firstOfNextYear = new Date(Date.UTC(date.getFullYear() + 1, 0, 1, 0, 0, 0))
                const fraction = (date - firstOfYear) / (firstOfNextYear - firstOfYear)
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
            const epochDay = 719529
            return ee.Date(ee.Number(t.subtract(epochDay).multiply(1000).multiply(3600).multiply(24)))
        case FRACTIONAL_YEARS:
            const firstOfYear = ee.Date.fromYMD(t.floor(), 1, 1)
            const firstOfNextYear = firstOfYear.advance(1, 'year')
            const daysInYear = firstOfNextYear.difference(firstOfYear, 'day')
            const dayOfYear = daysInYear.multiply(t.mod(1)).floor()
            return firstOfYear.advance(dayOfYear, 'day')
        case UNIX_TIME_MILLIS:
            return ee.Date(t)
        default:
            throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
        }
    },

    days: function (t1, t2, dateFormat) {
        const diff = t2.subtract(t1)
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

const harmonicFit = function () {
    return {
        fitImage,
        fitNumber,
        meanImage,
        meanNumber,
        phaseAndAmplitude
    }

    function fitImage(coefs, t, dateFormat, harmonics) {
        return ee.ImageCollection(
            fit(coefs, t, dateFormat, harmonics, function (index) {
                return coefs.arrayGet([index])
            })
        )
            .reduce(ee.Reducer.sum())
            .regexpRename('(.*)_coefs_sum', '$1', false)
    }

    function fitNumber(coefs, t, dateFormat, harmonics) {
        return fit(coefs, t, dateFormat, harmonics, function (index) {
            return ee.Number(coefs.get(index))
        }).reduce(ee.Reducer.sum())
    }

    function meanImage(coefs, tStart, tEnd, dateFormat, harmonics) {
        return mean(coefs, tStart, tEnd, dateFormat, harmonics, function (index) {
            return coefs.arrayGet([index])
        })
            .regexpRename('(.*)_coefs', '$1', false)
    }

    function meanNumber(coefs, tStart, tEnd, dateFormat, harmonics) {
        return mean(coefs, tStart, tEnd, dateFormat, harmonics, function (index) {
            return ee.Number(coefs.get(index))
        })
    }

    function fit(coefs, t, dateFormat, harmonics, coefExtractor) {
        dateFormat = dateFormat === undefined
            ? 0
            : dateFormat
        harmonics = harmonics === undefined
            ? 3
            : harmonics
        const omega = getOmega(dateFormat)

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
            c7: coefExtractor(7)
        })
    }

    function getOmega(dateFormat) {
        switch (dateFormat) {
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
    return Array.apply(start, Array(end)).map(function (_, i) {
        return i + start
    })
}

function coefsToPhase(coefs, harmonic) {
    harmonic = harmonic || 1
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

module.exports = {
    Segments,
    Segment,
    Classification,
    chartPoint
}
