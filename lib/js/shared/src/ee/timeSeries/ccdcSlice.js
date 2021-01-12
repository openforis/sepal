const {EMPTY, concat, of} = require('rx')
const {filter, map} = require('rx/operators')
const {sequence} = require('sepal/utils/array')
const {loadRecipe$} = require('sepal/ee/recipe')
const {getVisParams: getRadarVisParams} = require('../radar/visParams')
const ee = require('ee')
const imageFactory = require('sepal/ee/imageFactory')
const opticalVisParams = require('../optical/visParams')
const temporalSegmentation = require('./temporalSegmentation')
const _ = require('lodash')

const ccdcSlice = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model

    const ccdcBands = _.uniq([
        ...selectedBands
            .filter(
                band => !band.endsWith('_coefs') && !band.endsWith('_rmse') && !band.endsWith('_magnitude')
                    && !['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'].includes(band)
            ),
        ...selectedBands
            .filter(
                band => band.endsWith('_coefs') || band.endsWith('_rmse') || band.endsWith('_magnitude')
            )
            .map(
                band => band.substring(0, band.lastIndexOf('_'))
            )
    ])

    const ccdc = imageFactory(model.source, {selection: ccdcBands})
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
            return segment.fit({date, harmonics, extrapolateMaxDays})
                .addBands(segment.intercept())
                .addBands(segment.slope())
                .addBands(phaseAndAmplitude(segment, 3))
                .addBands(segment.toImage('.*_rmse'))
                .addBands(segment.toImage('.*_magnitude'))
                .addBands(segment.toImage('tStart'))
                .addBands(segment.toImage('tEnd'))
                .addBands(segment.toImage('tBreak'))
                .addBands(segment.toImage('numObs'))
                .addBands(segment.toImage('changeProb'))
        }

        const phaseAndAmplitude = segment => {
            return sequence(1, 3).map(harmonic =>
                segment.phase(harmonic).addBands(segment.amplitude(harmonic))
            )
        }

        const {options: {gapStrategy}} = model
        const slice = gapStrategy === 'INTERPOLATE'
            ? interpolate()
            : segmentSlice()

        function extracted() {
            return slice
        }

        return extracted()

    }
    return {
        getImage$() {
            return ccdc.getImage$().pipe(
                map(segmentsImage =>
                    ee.Image(
                        createSlice(segmentsImage)
                            .select(selectedBands)
                            .copyProperties(segmentsImage, segmentsImage.propertyNames())
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
                ui: {amplitude: [0, 5000], rmse: [0, 2000]},
                ndbi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ibi: {amplitude: [0, 5000], rmse: [0, 2000]},
                nbi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ebbi: {amplitude: [0, 5000], rmse: [0, 2000]},
                bui: {amplitude: [0, 5000], rmse: [0, 2000]},

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
            return ccdc.getGeometry$()
        }
    }
}

module.exports = ccdcSlice
