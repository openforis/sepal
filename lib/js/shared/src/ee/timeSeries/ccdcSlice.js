const {forkJoin, of, map, switchMap} = require('rxjs')
const {sequence} = require('#sepal/utils/array')
const ee = require('#sepal/ee')
const imageFactory = require('#sepal/ee/imageFactory')
const temporalSegmentation = require('./temporalSegmentation')
const _ = require('lodash')

const baseBandPattern = /(.*)_(intercept|slope|phase_\d|amplitude_\d|rmse|magnitude)$/

const ccdcSlice = (recipe, {selection: selectedBands, baseBands} = {selection: [], baseBands: []}) => {
    const model = recipe.model

    const selectedBands$ = selectedBands && selectedBands.length
        ? of(selectedBands)
        : imageFactory(model.source).getBands$()
    const breakAnalysisBands = model.options.breakAnalysisBand ? [model.options.breakAnalysisBand] : []
    baseBands = baseBands && baseBands.length
        ? _.uniq([...baseBands, ...breakAnalysisBands])
        : [...new Set([...selectedBands, ...breakAnalysisBands]
            .map(band => {
                const match = band.match(baseBandPattern)
                return match
                    ? match[1]
                    : ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'].includes(band)
                        ? null
                        : band
            })
            .filter(band => band)
        )]
    const bands$ = selectedBands$.pipe(
        map(selectedBands => ({selectedBands, baseBands}))
    )
    const ccdc$ = bands$.pipe(
        map(({selectedBands, baseBands}) =>
            ({
                selectedBands,
                baseBands,
                // Exclude band selection when ASSET_MOSAIC, since the base band names isn't actually on the asset
                ccdc: imageFactory(model.source, {selection: model.source.targetType === 'ASSET_MOSAIC' ? [] : baseBands})
            }))
    )
    const createSlice = segmentsImage => {
        const segments = temporalSegmentation.Segments(segmentsImage, model.source.dateFormat || 0)

        const interpolate = () => {
            const {date: {date}, options: {harmonics}} = model
            return segments.interpolate(date, harmonics)
        }

        const segmentSlice = () => {
            const {date: {date}, options: {harmonics, gapStrategy, extrapolateSegment, extrapolateMaxDays}} = model
            const strategy = gapStrategy === 'MASK' ? 'mask' : extrapolateSegment.toLowerCase()
            const segment = segments.findByDate(date, strategy)
            const magnitude = segment.toImage('.*_magnitude').regexpRename('(.*)_magnitude', '$1', false)
            const rmse = segment.toImage('.*_rmse').regexpRename('(.*)_rmse', '$1', false)
            const breakConfidence = magnitude.divide(rmse).regexpRename('(.*)', '$1_breakConfidence', false)
            return segment.fit({date, harmonics, extrapolateMaxDays})
                .addBands(segment.intercept())
                .addBands(segment.slope())
                .addBands(phaseAndAmplitude(segment, 3))
                .addBands(segment.toImage('.*_rmse'))
                .addBands(segment.toImage('.*_magnitude'))
                .addBands(breakConfidence)
                .addBands(segment.toImage('tStart'))
                .addBands(segment.toImage('tEnd'))
                .addBands(segment.toImage('tBreak'))
                .addBands(segment.toImage('numObs'))
                .addBands(segment.toImage('changeProb'))
        }

        const rangeSlice = () => {
            const {date: {startDate, endDate}, options: {harmonics}} = model
            const dateRange = segments.dateRange(startDate, endDate)
            const breakpoint = dateRange.pickBreakpoint(model.options)
            return dateRange.mean(harmonics)
                .addBands(breakpoint, null, true)
        }

        const phaseAndAmplitude = segment => {
            return sequence(1, 3).map(harmonic =>
                segment.phase(harmonic).addBands(segment.amplitude(harmonic))
            )
        }

        const {date: {dateType}, options: {gapStrategy}} = model
        return dateType === 'RANGE'
            ? rangeSlice()
            : gapStrategy === 'INTERPOLATE'
                ? interpolate()
                : segmentSlice()
    }

    return {
        getImage$: function () {
            return ccdc$.pipe(
                switchMap(({ccdc}) => {
                    return forkJoin({
                        image: ccdc.getImage$(),
                        geometry: ccdc.getGeometry$()
                    }).pipe(
                        map(({image, geometry}) => {
                            const slice = ee.Image(createSlice(image))
                            return (selectedBands.length
                                ? slice.select(_.uniq(selectedBands))
                                : slice
                            ).clip(geometry)
                        })
                    )
                })
            )
        },
        getBands$() {
            return ccdc$.pipe(
                switchMap(({ccdc}) => ccdc.getBands$().pipe(
                    map(sourceBands => {
                        const sourceBaseBands = sourceBands
                            .filter(band => band.endsWith('_coefs'))
                            .map(band => band.substring(0, band.indexOf('_coefs')))
                        const rmse = sourceBands.filter(band => band.endsWith('_rmse'))
                        const magnitude = sourceBands.filter(band => band.endsWith('_magnitude'))
                        const breakConfidence = sourceBaseBands.map(band => `${band}_breakConfidence`)
                        const segmentBands = _.intersection(sourceBands, ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'])
                        const intercept = sourceBaseBands.map(band => `${band}_intercept`)
                        const slope = sourceBaseBands.map(band => `${band}_slope`)
                        const phase1 = sourceBaseBands.map(band => `${band}_phase_1`)
                        const amplitude1 = sourceBaseBands.map(band => `${band}_amplitude_1`)
                        const phase2 = sourceBaseBands.map(band => `${band}_phase_2`)
                        const amplitude2 = sourceBaseBands.map(band => `${band}_amplitude_2`)
                        const phase3 = sourceBaseBands.map(band => `${band}_phase_3`)
                        const amplitude3 = sourceBaseBands.map(band => `${band}_amplitude_3`)
                        return [
                            ...sourceBaseBands,
                            ...rmse,
                            ...magnitude,
                            ...breakConfidence,
                            ...intercept,
                            ...slope,
                            ...phase1,
                            ...amplitude1,
                            ...phase2,
                            ...amplitude2,
                            ...phase3,
                            ...amplitude3,
                            ...segmentBands
                        ]
                    })
                ))
            )
        },
        getGeometry$() {
            return imageFactory(model.source).getGeometry$()
        },

        histogramMaxPixels: model.source === 'RECIPE_REF' ? 1e3 : null
    }
}

module.exports = ccdcSlice
