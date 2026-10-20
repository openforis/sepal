import _ from 'lodash'
import moment from 'moment'

import {PRIMARY_IMAGE} from '#sepal/recipe/type/ccdcSlice'
import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {toT} from '~/app/home/body/process/recipe/ccdc/t'
import {pyramidingPolicies} from '~/app/home/body/process/recipe/recipeTaskSubmitter'
import {normalize} from '~/app/home/map/visParams/visParams'
import {selectFrom} from '~/stateUtils'

import {segmentDatesOf} from '../segmentEvidence'
import {visualizationsWithAvailableBands} from '../visualizationMatching'
import {chartSourceReference, dateFormatOf, materializedTemplates, outputBandsOf} from './sliceEvidence'

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
        setChartPixel(latLng) {
            return actionBuilder('SET_CHART_PIXEL', latLng)
                .set('ui.chartPixel', latLng)
                .dispatch()
        }
    }
}

// The endpoint takes the source reference and resolves the rest from the source itself. What it is handed
// is what the recipe selected, not a description of it.
export const loadCCDCSegments$ = ({recipe, latLng, bands}) =>
    api.gee.loadCCDCSegments$({recipe: chartSourceReference(recipe), latLng, bands})

// Everything this recipe offers over its own output: the source's templates that survive the operation, plus
// the break-date preset it derives itself. One list, so what the layer form offers is exactly what the
// generic reconciler will accept - two lists let the form offer a style the reconciler then called stale. Matched by
// name: which of them can be drawn is the layer's filter to decide, over the bands the slice's description holds.
export const preSetVisualizations = (recipe, resolved) =>
    visualizationsWithAvailableBands(
        [...materializedTemplates(recipe, resolved), ...additionalVisualizations(recipe, resolved)],
        outputBandsOf(recipe, resolved)
    )

const additionalVisualizations = (recipe, resolved) => {
    const dateType = selectFrom(recipe, 'model.date.dateType')
    const date = selectFrom(recipe, 'model.date.date')
    const startDate = selectFrom(recipe, 'model.date.startDate')
    const endDate = selectFrom(recipe, 'model.date.endDate')
    const {endDate: segmentsEndDate} = segmentDatesOf(recipe, PRIMARY_IMAGE, resolved)
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

// Every band a slice derives is scalar and declares no policy; the generic export sends Earth Engine's own default
// for each, as it always has, and nothing for a band that is not verified scalar.
export const retrieveTask = {
    fallbackPyramidingPolicy: pyramidingPolicies.mean
}
