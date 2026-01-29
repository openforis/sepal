import _ from 'lodash'
import moment from 'moment'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {toT} from '~/app/home/body/process/recipe/ccdc/t'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'
import {normalize} from '~/app/home/map/visParams/visParams'
import {selectFrom} from '~/stateUtils'

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

export const loadCCDCSegments$ = ({recipe, latLng, bands}) =>
    api.gee.loadCCDCSegments$({recipe: recipe.model.source, latLng, bands})

export const getAllVisualizations = recipe => {
    return recipe.ui.initialized
        ? [
            ...Object.values((selectFrom(recipe, ['layers.userDefinedVisualizations', 'this-recipe']) || {})),
            ...selectFrom(recipe, 'model.source.visualizations') || [],
            ...additionalVisualizations(recipe)
        ]
        : []
}

export const additionalVisualizations = recipe => {
    const dateType = selectFrom(recipe, 'model.date.dateType')
    const date = selectFrom(recipe, 'model.date.date')
    const startDate = selectFrom(recipe, 'model.date.startDate')
    const endDate = selectFrom(recipe, 'model.date.endDate')
    const segmentsEndDate = selectFrom(recipe, 'model.source.endDate')
    const dateFormat = selectFrom(recipe, 'model.source.dateFormat')
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

const submitRetrieveRecipeTask = recipe => {
    const {baseBands, bandTypes, segmentBands} = recipe.ui.retrieveOptions
    const bandTypeSuffixes = {
        value: '',
        rmse: '_rmse',
        magnitude: '_magnitude',
        breakConfidence: '_breakConfidence',
        intercept: '_intercept',
        slope: '_slope',
        phase_1: '_phase_1',
        phase_2: '_phase_2',
        phase_3: '_phase_3',
        amplitude_1: '_amplitude_1',
        amplitude_2: '_amplitude_2',
        amplitude_3: '_amplitude_3',
    }
    const allBands = [
        ...recipe.model.source.bands,
        ...recipe.model.source.baseBands
            .map(({name}) => Object.values(bandTypeSuffixes)
                .map(suffix => `${name}${suffix}`)
            )
            .flat()
    ]
    const bands = [
        ...baseBands
            .map(name => bandTypes
                .map(bandType => `${name}${bandTypeSuffixes[bandType]}`)
            )
            .flat(),
        ...baseBands.map(({name}) => name),
        ...segmentBands
    ].filter(band => allBands.includes(band))

    return submitTask(recipe, {
        filterVisualizations: true,
        customizeImage: image => ({
            ...image,
            bands: {selection: bands, baseBands}
        })
    })
}
