const ee = require('ee')
const {EMPTY, concat, of} = require('rx')
const {filter, map} = require('rx/operators')
const temporalSegmentation = require('./temporalSegmentation')
const {sequence} = require('sepal/utils/array')
const opticalVisParams = require('../optical/visParams')
const {getVisParams: getRadarVisParams} = require('../radar/visParams')

const ccdcSlice = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const segmentsImage = ee.Image(model.source.asset)
    const geometry = segmentsImage.geometry()
    return {
        getImage$() {
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
                    .addBands(phaseAndAmplitude(segment, harmonics))
                    .addBands(segment.toImage('.*_rmse'))
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
            return of(ee.Image(
                slice
                    .select(selectedBands)
                    .copyProperties(segmentsImage, segmentsImage.propertyNames())
            ))
        },
        getVisParams$: function (image) {
            const opticalBandCombinations$ = ee.getInfo$(image.get('surfaceReflectance'), 'check if surfaceReflectance').pipe(
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

                blue: {amplitude: [0, 400], rmse: [0, 500]},
                green: {amplitude: [0, 400], rmse: [0, 500]},
                red: {amplitude: [0, 600], rmse: [0, 500]},
                nir: {amplitude: [0, 1000], rmse: [0, 700]},
                swir1: {amplitude: [0, 1400], rmse: [0, 1500]},
                swir2: {amplitude: [0, 1200], rmse: [0, 1000]},

                ndvi: {amplitude: [0, 4000], rmse: [0, 2000]},
                ndmi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ndwi: {amplitude: [0, 3000], rmse: [0, 2000]},
                // TODO: Tweak the index ranges
                mndwi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ndfi: {amplitude: [0, 5000], rmse: [0, 2000]},
                evi: {amplitude: [0, 5000], rmse: [0, 2000]},
                evi2: {amplitude: [0, 5000], rmse: [0, 2000]},
                savi: {amplitude: [0, 5000], rmse: [0, 2000]},
                nbr: {amplitude: [0, 5000], rmse: [0, 2000]},
                ui: {amplitude: [0, 5000], rmse: [0, 2000]},
                ndbi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ibi: {amplitude: [0, 5000], rmse: [0, 2000]},
                nbi: {amplitude: [0, 5000], rmse: [0, 2000]},
                ebbi: {amplitude: [0, 5000], rmse: [0, 2000]},
                bui: {amplitude: [0, 5000], rmse: [0, 2000]}

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
                const harmonics$ = of(visParams)
                return harmonics$
            } else
                return concat(opticalBandCombinations$, opticalIndex$, radarBandCombinations$)
        },
        getGeometry$() {
            return of(geometry)
        }
    }
}

module.exports = ccdcSlice
