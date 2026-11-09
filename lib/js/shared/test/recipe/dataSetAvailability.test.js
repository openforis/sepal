import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {periodOfDates, periodOfYears} from '#sepal/recipe/dataSetAvailability'
import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// A recipe reading a date-filtered collection needs one of its chosen data sets to be one the catalogue says may hold
// imagery in the period its execution reads: otherwise the operations reading that imagery are refused at the data sets,
// naming the years. Some overlap establishes possible imagery only; a period not fully stated judges nothing. Codes,
// paths, operations and data-set identifiers are literals.

const L9 = {LANDSAT: ['LANDSAT_9']}
const L8 = {LANDSAT: ['LANDSAT_8']}
const TM = {LANDSAT: ['LANDSAT_TM']}

const TYPES = [
    {
        type: 'MOSAIC',
        held: ['IMAGE_OUTPUT'],
        free: [],
        model: ({dataSets, from, to}) => mosaicModel({dataSets, dates: season(from, to)}),
        unstated: {dates: {}}
    },
    {
        type: 'CCDC',
        held: ['IMAGE_OUTPUT', 'PIXEL_OBSERVATIONS', 'PIXEL_SEGMENTS', 'COUNT'],
        free: [],
        model: ({dataSets, from, to}) => ccdcModel({dataSets, dates: {startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}}),
        unstated: {dates: {startDate: '2000-01-01'}}
    },
    {
        type: 'TIME_SERIES',
        held: ['IMAGE_OUTPUT', 'PIXEL_OBSERVATIONS'],
        free: [],
        model: ({dataSets, from, to}) => timeSeriesModel({dataSets, dates: {startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}}),
        unstated: {dates: {endDate: '2000-01-01'}}
    },
    {
        type: 'PHENOLOGY',
        held: ['IMAGE_OUTPUT'],
        free: [],
        model: ({dataSets, from, to}) => phenologyModel({dataSets, dates: {fromYear: from, toYear: to}}),
        unstated: {dates: {fromYear: 2000}}
    },
    {
        type: 'LANDTRENDR',
        held: ['IMAGE_OUTPUT'],
        // The annual mosaic reads a year of its own, which no configuration requirement sees.
        free: ['ANNUAL_MOSAIC'],
        model: ({dataSets, from, to}) => landTrendrModel({dataSets, dates: {startYear: from, endYear: to}}),
        unstated: {dates: {startYear: 2000}}
    },
    {
        type: 'CHANGE_ALERTS',
        held: ['IMAGE_OUTPUT', 'PIXEL_OBSERVATIONS'],
        // The reference's segments are read whatever imagery the monitoring data sets hold.
        free: ['PIXEL_SEGMENTS'],
        // Monitoring the first half of `to`, calibrated from the start of `from`.
        model: ({dataSets, from, to}) => changeAlertsModel({dataSets, date: {
            monitoringEnd: `${to}-07-01`, monitoringDuration: 6, monitoringDurationUnit: 'months',
            calibrationDuration: to - from, calibrationDurationUnit: 'years'
        }}),
        unstated: {date: {monitoringEnd: '2000-01-01'}}
    },
    {
        type: 'PYEO_ALERTS',
        held: ['IMAGE_OUTPUT'],
        free: [],
        model: ({dataSets, from, to}) => pyeoModel({dataSets, dates: {
            baselineStart: `${from - 1}-01-01`, baselineEnd: `${from}-01-01`, monitoringStart: `${from}-01-01`, monitoringEnd: `${to + 1}-01-01`
        }}),
        unstated: {dates: {monitoringStart: '2000-01-01'}}
    }
]

for (const t of TYPES) {
    describe(`a ${t.type} whose chosen data sets the catalogue says hold no imagery in the period it reads`, () => {
        for (const operation of t.held) {
            it(`cannot run ${operation}, refused at the data sets, naming the years`, () => {
                const recipe = recipeOf(t, t.model({dataSets: L9, from: 1990, to: 1995}))

                assert.deepEqual(periodFindings(recipe, operation), [
                    {code: 'NO_PERIOD_OVERLAP', path: ['model', 'sources', 'dataSets'], startYear: 1990, endYear: 1995}
                ])
            })
        }

        for (const operation of t.free) {
            it(`is not refused ${operation} for it`, () => {
                const recipe = recipeOf(t, t.model({dataSets: L9, from: 1990, to: 1995}))

                assert.deepEqual(periodFindings(recipe, operation), [])
            })
        }

        it('runs where another data set chosen may hold imagery in some of those years', () => {
            const recipe = recipeOf(t, t.model({dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_TM']}, from: 1990, to: 1995}))

            assert.deepEqual(periodFindings(recipe, t.held[0]), [])
        })

        it('judges nothing while its period is not fully stated', () => {
            const recipe = recipeOf(t, {...t.model({dataSets: L9, from: 1990, to: 1995}), ...t.unstated})

            assert.deepEqual(periodFindings(recipe, t.held[0]), [])
        })

        it('judges nothing while no data set is chosen', () => {
            const recipe = recipeOf(t, t.model({dataSets: {}, from: 1990, to: 1995}))

            assert.deepEqual(periodFindings(recipe, t.held[0]), [])
        })
    })
}

describe('the years a data set may hold imagery for', () => {
    const ccdcOver = (dataSets, from, to, sources) => recipeOf(TYPES[1], {
        ...ccdcModel({dataSets, dates: {startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}}),
        ...(sources && {sources: {...ccdcModel({dataSets}).sources, ...sources}})
    })

    // COPERNICUS/S1_GRD begins in October 2014.
    it('begin for Sentinel-1 in 2014', () => {
        const radar = {dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}

        assert.deepEqual(codesOf(ccdcOver(radar.dataSets, 2014, 2014, radar)), [])
        assert.deepEqual(codesOf(ccdcOver(radar.dataSets, 2013, 2013, radar)), ['NO_PERIOD_OVERLAP'])
    })

    it('are not stated for Planet imagery, which is never refused for them', () => {
        const planet = {dataSetType: 'PLANET', dataSets: {PLANET: ['DAILY']}}

        assert.deepEqual(codesOf(ccdcOver(planet.dataSets, 1990, 1995, planet)), [])
    })

    it('end for Landsat 4-5 in 2012', () => {
        assert.deepEqual(codesOf(ccdcOver(TM, 2012, 2020)), [])
        assert.deepEqual(codesOf(ccdcOver(TM, 2013, 2020)), ['NO_PERIOD_OVERLAP'])
    })
})

describe('the period an Optical Mosaic reads', () => {
    const mosaicOver = (dataSets, dates, more) => recipeOf(TYPES[0], {...mosaicModel({dataSets, dates}), ...more})

    it('is its season, ending before its exclusive end', () => {
        assert.deepEqual(codesOf(mosaicOver(L8, {seasonStart: '2012-01-01', seasonEnd: '2013-01-01'})), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(mosaicOver(L8, {seasonStart: '2012-06-01', seasonEnd: '2013-01-02'})), [])
    })

    it('includes the years before and after the season it composites', () => {
        assert.deepEqual(codesOf(mosaicOver(L8, {...season(2012, 2012), yearsAfter: 1})), [])
        assert.deepEqual(codesOf(mosaicOver(TM, {...season(2015, 2015), yearsBefore: 2})), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(mosaicOver(TM, {...season(2015, 2015), yearsBefore: 3})), [])
    })

    // Selected scenes are composited by id, whatever the dates and data sets.
    it('holds nothing back while it composites selected scenes', () => {
        const recipe = mosaicOver(L9, season(1990, 1990), {sceneSelectionOptions: {type: 'SELECT'}})

        assert.deepEqual(codesOf(recipe), [])
    })

    it('is judged over data sets saved in the earlier form, as execution migrates them', () => {
        const recipe = mosaicOver(L9, season(1990, 1990), {sources: L9})

        assert.deepEqual(codesOf(recipe), ['NO_PERIOD_OVERLAP'])
    })
})

describe('the period a Change Alerts reads', () => {
    const changeAlertsOver = date => recipeOf(TYPES[5], changeAlertsModel({dataSets: L8, date: {
        monitoringDurationUnit: 'months', calibrationDurationUnit: 'months', ...date
    }}))

    it('runs from its calibration start to its exclusive monitoring end', () => {
        assert.deepEqual(codesOf(changeAlertsOver({monitoringEnd: '2013-01-01', monitoringDuration: 1, calibrationDuration: 1})), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(changeAlertsOver({monitoringEnd: '2013-01-02', monitoringDuration: 1, calibrationDuration: 1})), [])
    })

    it('includes calibration years before monitoring', () => {
        const recipe = recipeOf(TYPES[5], changeAlertsModel({dataSets: TM, date: {
            monitoringEnd: '2014-07-01', monitoringDuration: 6, monitoringDurationUnit: 'months', calibrationDuration: 2, calibrationDurationUnit: 'years'
        }}))

        assert.deepEqual(codesOf(recipe), [])
    })
})

describe('the period a PyEO Alerts reads', () => {
    it('is its monitoring period, whatever its baseline dates', () => {
        const recipe = recipeOf(TYPES[6], pyeoModel({dataSets: L8, dates: {
            baselineStart: '2014-01-01', baselineEnd: '2015-01-01', monitoringStart: '2010-01-01', monitoringEnd: '2012-01-01'
        }}))

        assert.deepEqual(codesOf(recipe), ['NO_PERIOD_OVERLAP'])
    })
})

describe('a period of dates', () => {
    it('is the years from its start to the day before its exclusive end', () => {
        assert.deepEqual(periodOfDates('2012-03-01', '2014-01-01'), {startYear: 2012, endYear: 2013})
        assert.deepEqual(periodOfDates('2012-03-01', '2014-01-02'), {startYear: 2012, endYear: 2014})
    })

    for (const [_case, start, end] of [
        ['without a start', undefined, '2014-01-01'],
        ['without an end', '2012-01-01', null],
        ['with a date that does not exist', '2012-02-30', '2014-01-01'],
        ['in another form', '2012-01-01T00:00:00Z', '2014-01-01'],
        ['ending where it starts', '2012-01-01', '2012-01-01'],
        ['ending before it starts', '2014-01-01', '2012-01-01']
    ]) {
        it(`is none ${_case}`, () => {
            assert.equal(periodOfDates(start, end), null)
        })
    }
})

describe('a period of years', () => {
    it('includes both its years', () => {
        assert.deepEqual(periodOfYears(2012, 2012), {startYear: 2012, endYear: 2012})
    })

    for (const [_case, start, end] of [['without an end', 2012, undefined], ['of fractional years', 2012.5, 2014], ['ending before it starts', 2014, 2012]]) {
        it(`is none ${_case}`, () => {
            assert.equal(periodOfYears(start, end), null)
        })
    }
})

function season(from, to) {
    return {targetDate: `${from}-07-01`, seasonStart: `${from}-01-01`, seasonEnd: `${to + 1}-01-01`, yearsBefore: 0, yearsAfter: 0}
}

function optical(dataSets) {
    return {dataSetType: 'OPTICAL', classification: null, assets: [], cloudPercentageThreshold: 75, dataSets}
}

function mosaicModel({dataSets, dates}) {
    return {
        dates: {yearsBefore: 0, yearsAfter: 0, ...dates},
        sources: {dataSets, cloudPercentageThreshold: 75},
        sceneSelectionOptions: {type: 'ALL'},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    }
}

function ccdcModel({dataSets, dates}) {
    return {dates, sources: {...optical(dataSets), breakpointBands: ['ndvi']}, options: {corrections: ['SR']}, ccdcOptions: {dateFormat: 1, minObservations: 6}}
}

function timeSeriesModel({dataSets, dates}) {
    return {dates, sources: optical(dataSets), options: {corrections: ['SR']}}
}

function phenologyModel({dataSets, dates}) {
    return {dates, sources: {...optical(dataSets), band: 'ndvi'}, options: {corrections: ['SR']}}
}

function landTrendrModel({dataSets, dates}) {
    return {dates, sources: {dataSets, cloudPercentageThreshold: 75, index: 'ndvi'}, options: {corrections: ['SR']}, landTrendrOptions: {}}
}

function changeAlertsModel({dataSets, date}) {
    return {reference: {}, date, sources: {...optical(dataSets), band: 'ndvi'}, options: {corrections: ['SR']}, changeAlertsOptions: {}}
}

function pyeoModel({dataSets, dates}) {
    return {
        dates,
        sources: {classification: 'classification-1', dataSets, cloudPercentageThreshold: 75, changeFromClasses: [1], changeToClasses: [2]},
        options: {corrections: ['SR']},
        pyeoAlertsOptions: {}
    }
}

function recipeOf({type}, model) {
    return {id: `${type.toLowerCase()}-1`, type, model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}, ...model}}
}

function readinessOf(recipe, operation) {
    return readReadiness({
        graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
        operation,
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        readinessFor: ({type}) => recipeType(type)
    }).readiness
}

function periodFindings(recipe, operation) {
    return (readinessOf(recipe, operation).findings || [])
        .filter(({code}) => code === 'NO_PERIOD_OVERLAP')
        .map(({recipePath: _recipePath, operation: _operation, ...finding}) => finding)
}

function codesOf(recipe) {
    return periodFindings(recipe, 'IMAGE_OUTPUT').map(({code}) => code)
}
