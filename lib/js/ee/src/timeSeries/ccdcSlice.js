import _ from 'lodash'
import {forkJoin, map, of, switchMap} from 'rxjs'

import {assetProperties$} from '#sepal/ee/asset'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {ASSET, RECIPE_REF} from '#sepal/recipe/source/reference'
import {sliceOutputBands} from '#sepal/recipe/type/ccdcSlice'
import {sequence} from '#sepal/utils/array'

import * as temporalSegmentation from './temporalSegmentation.js'

const baseBandPattern = /(.*)_(intercept|slope|phase_\d|amplitude_\d|rmse|magnitude|breakConfidence)$/

// What Slice has to know about its source before it can run it: the representation its segment dates are
// stored in, and whether the base band names a reader derives can be selected on it. Both are facts about
// the source, so the source's own definition declares them and this asks for the declaration rather than
// recognising producer types.
//
// A producer whose segments ARE an Earth Engine asset names the asset instead of stating a date
// representation, and it is read from the asset now. The metadata such a recipe holds is a copy taken when
// the asset was selected, and an asset re-exported since has moved on from it.
//
// A source that declares nothing at all falls back to the copies an older GUI saved beside the reference.
const segmentSourceOf = record => record && recipeType(record.type)?.segmentSource

const selectableBaseBands = (source, declared) => declared
    ? declared.selectableBaseBands !== false
    : source.targetType !== 'ASSET_MOSAIC'

const dateFormat$ = (source, declared, model) => {
    const segmentsAsset = source.type === ASSET && source.dateFormat == null
        ? source.id
        : declared?.segmentsAsset?.(model)
    return segmentsAsset
        ? assetProperties$(segmentsAsset).pipe(
            map(({dateFormat}) => dateFormat ?? source.dateFormat)
        )
        : of(declared?.dateFormat?.(model) ?? source.dateFormat)
}

// The source resolved once: its date representation and the image built from the very record it was declared
// by. `buildImage` runs inside the load, so facts and execution can never describe different records.
const resolveSource$ = (source, baseBands) => source.type === RECIPE_REF
    ? imageFactory(source).withRecord$((record, buildImage) => {
        const declared = segmentSourceOf(record)
        return {
            declared,
            model: record.model,
            ccdc: buildImage({selection: selectableBaseBands(source, declared) ? baseBands : []})
        }
    }).pipe(
        switchMap(({declared, model, ccdc}) => dateFormat$(source, declared, model).pipe(
            map(dateFormat => ({dateFormat, ccdc}))
        ))
    )
    : dateFormat$(source).pipe(
        map(dateFormat => ({dateFormat, ccdc: imageFactory(source, {selection: baseBands})}))
    )

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
