import _ from 'lodash'
import moment from 'moment'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {toT} from '~/app/home/body/process/recipe/ccdc/t'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'
import {normalize} from '~/app/home/map/visParams/visParams'
import {selectFrom} from '~/stateUtils'

import {renderableVisualizations} from '../visualizationMatching'
import {availableBandsOf, chartSourceReference, dateFormatOf, materializedTemplates, segmentDatesOf, selectedOutputBands} from './sliceEvidence'

export const defaultModel = {
    date: {
    },
    source: {},
    options: {
        harmonics: 3,
        gapStrategy: 'INTERPOLATE',
        extrapolateSegment: 'CLOSEST',
        extrapolateMaxDays: 30,
        skipBreakInLastSegment: false
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        setBands(selection, baseBands) {
            return actionBuilder('SET_BANDS', {selection, baseBands})
                .set('ui.bands.selection', selection)
                .set('ui.bands.baseBands', baseBands)
                .dispatch()
        },
        // Runtime provenance for restored styles, captured before the source can be changed or observed.
        recordSavedLayerSource(sourceKey) {
            return actionBuilder('RECORD_SAVED_LAYER_SOURCE', {sourceKey})
                .set('ui.savedLayerSource', sourceKey)
                .dispatch()
        },
        setChartPixel(latLng) {
            return actionBuilder('SET_CHART_PIXEL', latLng)
                .set('ui.chartPixel', latLng)
                .dispatch()
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_CCDC_SLICE_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .build()
        }
    }
}

// The endpoint takes the source reference and resolves the rest from the source itself. What it is handed
// is what the recipe selected, not a description of it.
export const loadCCDCSegments$ = ({recipe, latLng, bands}) =>
    api.gee.loadCCDCSegments$({recipe: chartSourceReference(recipe), latLng, bands})

// Everything this recipe offers over its own output: the source's templates that survive the operation, plus
// the break-date preset it derives itself. One list, so what the layer form offers is exactly what the
// generic reconciler will accept - two lists let the form offer a style the reconciler then called stale.
export const preSetVisualizations = (recipe, resolved) =>
    renderableVisualizations(
        [...materializedTemplates(recipe, resolved), ...additionalVisualizations(recipe, resolved)],
        availableBandsOf(recipe, resolved)
    )

const additionalVisualizations = (recipe, resolved) => {
    const dateType = selectFrom(recipe, 'model.date.dateType')
    const date = selectFrom(recipe, 'model.date.date')
    const startDate = selectFrom(recipe, 'model.date.startDate')
    const endDate = selectFrom(recipe, 'model.date.endDate')
    const {endDate: segmentsEndDate} = segmentDatesOf(recipe, resolved)
    const dateFormat = dateFormatOf(recipe, resolved)
    const dataTypesByDateFormat = ['number', 'fractionalYears', 'number']

    const DATE_FORMAT = 'YYYY-MM-DD'

    const getBreakMinMax = () => {
        if (dateType === 'RANGE') {
            return {
                min: Math.round(toT(moment(startDate, DATE_FORMAT).startOf('year').toDate(), dateFormat)),
                max: Math.round(toT(moment(endDate, DATE_FORMAT).add(1, 'years').startOf('year').toDate(), dateFormat))
            }
        } else {
            return {
                min: Math.round(toT(
                    moment(date, DATE_FORMAT).add(-1, 'years').startOf('year').toDate() || moment('1982-01-01', DATE_FORMAT).toDate(),
                    dateFormat
                )),
                max: Math.round(toT(
                    moment(segmentsEndDate, DATE_FORMAT).toDate() || moment().add(1, 'years').startOf('year').toDate(),
                    dateFormat
                ))
            }
        }
    }
    return [
        normalize({
            type: 'continuous',
            bands: ['tBreak'],
            dataType: dataTypesByDateFormat[dateFormat],
            ...getBreakMinMax(),
            palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
        }),
    ]
}

// The selection is base bands and measures; the export is the band names those resolve to. The shared
// submitter is handed them as its band selection - it filters the exported visualizations by them - while
// the image also carries the base bands the slice operation needs.
export const submitRetrieveRecipeTask = recipe => {
    const retrieveOptions = recipe.ui.retrieveOptions
    const bands = selectedOutputBands(recipe, retrieveOptions)

    return submitTask(recipe, {
        retrieveOptions: {...retrieveOptions, bands},
        filterVisualizations: true,
        customizeImage: image => ({
            ...image,
            bands: {selection: bands, baseBands: retrieveOptions.baseBands}
        })
    })
}
