import _ from 'lodash'
import {forkJoin, map, switchMap} from 'rxjs'

import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {sliceOutputBands} from '#sepal/recipe/type/ccdcSlice'
import {sequence} from '#sepal/utils/array'

import {withSegmentSource$} from './segmentSource.js'
import * as temporalSegmentation from './temporalSegmentation.js'

const baseBandPattern = /(.*)_(intercept|slope|phase_\d|amplitude_\d|rmse|magnitude|breakConfidence)$/

// The source resolved once: the facts of whichever recipe actually produces its segments, and the image of
// the source the user selected, built with the selection those facts allow.
const resolveSource$ = (source, baseBands) =>
    withSegmentSource$(source, ({dateFormat, selectableBaseBands}, buildImage) => ({
        dateFormat,
        ccdc: buildImage({selection: selectableBaseBands ? baseBands : []})
    }))

const ccdcSlice = (recipe, {selection: selectedBands, baseBands} = {selection: [], baseBands: []}) => {
    const model = recipe.model

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
    const ccdc$ = resolveSource$(model.source, baseBands)
    const createSlice = (segmentsImage, dateFormat) => {
        const segments = temporalSegmentation.Segments(segmentsImage, dateFormat || 0)

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
            return segment.slice({date, harmonics, extrapolateMaxDays})
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
                switchMap(({ccdc, dateFormat}) => {
                    return forkJoin({
                        image: ccdc.getImage$(),
                        geometry: ccdc.getGeometry$()
                    }).pipe(
                        map(({image, geometry}) => {
                            const slice = ee.Image(createSlice(image, dateFormat))
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
                    map(sourceBands => sliceOutputBands(sourceBands, model))
                ))
            )
        },
        getGeometry$() {
            return imageFactory(model.source).getGeometry$()
        },

        histogramMaxPixels: model.source === 'RECIPE_REF' ? 1e3 : null
    }
}

export default ccdcSlice
