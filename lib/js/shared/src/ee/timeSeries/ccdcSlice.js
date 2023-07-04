const {EMPTY, concat, forkJoin, of, filter, map, switchMap} = require('rxjs')
const {sequence} = require('#sepal/utils/array')
const {loadRecipe$} = require('#sepal/ee/recipe')
const {getVisParams: getRadarVisParams} = require('../radar/visParams')
const ee = require('#sepal/ee')
const imageFactory = require('#sepal/ee/imageFactory')
const opticalVisParams = require('../optical/visParams')
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
                ccdc: imageFactory(model.source, {selection: baseBands})
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
        getVisParams$(image) {
            const sr$ = model.source.type === 'ASSET'
                ? ee.getInfo$(image.get('surfaceReflectance'), 'check if surfaceReflectance')
                : loadRecipe$(model.source.id).pipe(
                    map(recipe => recipe.model.options.corrections.includes('SR'))
                )
            const opticalBandCombinations$ = sr$.pipe(
                map(surfaceReflectance => opticalVisParams[surfaceReflectance ? 'SR' : 'TOA'][selectedBands.join('|')]),
                filter(visParams => visParams)
            )

            const opticalIndex$ = selectedBands.length === 1
                ? of(opticalVisParams.indexes[selectedBands[0]]).pipe(
                    filter(visParams => visParams)
                )
                : EMPTY

            const radarBandCombinations$ = of(getRadarVisParams(selectedBands, [], 10000)).pipe(
                filter(visParams => visParams)
            )

            const bandDefs = {
                VV: {amplitude: [4000, 40000], rmse: [15000, 35000]},
                VH: {amplitude: [3000, 40000], rmse: [15000, 40000]},
                ratio_VV_VH: {amplitude: [0, 1200], rmse: [0, 3000]},

                blue: {amplitude: [0, 500], rmse: [0, 500]},
                green: {amplitude: [0, 500], rmse: [0, 500]},
                red: {amplitude: [0, 700], rmse: [0, 700]},
                nir: {amplitude: [0, 1000], rmse: [0, 1000]},
                swir1: {amplitude: [0, 1800], rmse: [0, 1800]},
                swir2: {amplitude: [0, 1800], rmse: [0, 1800]},

                ndvi: {amplitude: [0, 3000], rmse: [0, 2500]},
                ndmi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ndwi: {amplitude: [0, 3000], rmse: [0, 3000]},
                mndwi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ndfi: {amplitude: [0, 10000], rmse: [0, 8500]},
                evi: {amplitude: [0, 10000], rmse: [0, 10000]},
                evi2: {amplitude: [0, 10000], rmse: [0, 6500]},
                savi: {amplitude: [0, 10000], rmse: [0, 4000]},
                nbr: {amplitude: [0, 5000], rmse: [0, 2000]},
                mvi: {amplitude: [0, 10000], rmse: [0, 4000]},
                ui: {amplitude: [0, 5000], rmse: [0, 2000]},
                ndbi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ibi: {amplitude: [0, 5000], rmse: [0, 2000]},
                nbi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ebbi: {amplitude: [0, 5000], rmse: [0, 2000]},
                bui: {amplitude: [0, 5000], rmse: [0, 2000]},
                kndvi: {amplitude: [0, 3000], rmse: [0, 2500]},

                wetness: {amplitude: [0, 1500], rmse: [0, 1500]},
                greenness: {amplitude: [0, 3000], rmse: [0, 1500]},
                brightness: {amplitude: [0, 3000], rmse: [0, 3000]}

            }

            const bandsWithHarmonics = [...new Set(selectedBands
                .map(band => band.match('(.*)_amplitude_1'))
                .map(match => match && match[1])
                .filter(baseBand => baseBand)
            )]
            if (bandsWithHarmonics.length) {
                const selectedBandDefs = bandsWithHarmonics.map(band => bandDefs[band])
                const min = selectedBandDefs.map(bandDef => [-Math.PI, bandDef.amplitude[0], bandDef.rmse[0]]).flat()
                const max = selectedBandDefs.map(bandDef => [Math.PI, bandDef.amplitude[1], bandDef.rmse[1]]).flat()
                const stretch = [null, null, [1, 0]]
                const visParams = {bands: selectedBands, min, max, stretch, hsv: true}
                return of(visParams)
            } else
                return concat(opticalBandCombinations$, opticalIndex$, radarBandCombinations$)
        },
        getGeometry$() {
            return imageFactory(model.source).getGeometry$()
        },

        histogramMaxPixels: model.source === 'RECIPE_REF' ? 1e3 : null
    }
}

module.exports = ccdcSlice
