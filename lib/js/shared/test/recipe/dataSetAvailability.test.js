import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {dataSetDates, excludedDataSets, periodOfDates, periodOfYears} from '#sepal/recipe/dataSetAvailability'
import {OPTICAL_DATA_SETS} from '#sepal/recipe/optical/collectionDates'
import {recordedProperties} from '#sepal/recipe/output/imageOutput'
import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// A recipe reading a date-filtered collection needs one of its chosen data sets to be one the catalogue says may hold
// imagery on some day of the period its execution reads, in the collections its correction selects: otherwise the
// operations reading that imagery are refused at the data sets, naming the period. Some overlap establishes possible
// imagery only; a period not fully stated judges nothing. Codes, paths, operations, dates and data-set identifiers are
// literals; the catalogue's days are those of optical/collectionDates.js.

const L9 = {LANDSAT: ['LANDSAT_9']}
const L8 = {LANDSAT: ['LANDSAT_8']}
const TM = {LANDSAT: ['LANDSAT_TM']}
const L7 = {LANDSAT: ['LANDSAT_7']}

const TYPES = [
    {
        type: 'MOSAIC',
        days: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        held: ['IMAGE_OUTPUT'],
        free: [],
        model: ({dataSets, from, to}) => mosaicModel({dataSets, dates: season(from, to)}),
        unstated: {dates: {}}
    },
    {
        type: 'CCDC',
        days: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        held: ['IMAGE_OUTPUT', 'PIXEL_OBSERVATIONS', 'PIXEL_SEGMENTS', 'COUNT'],
        free: [],
        model: ({dataSets, from, to}) => ccdcModel({dataSets, dates: {startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}}),
        unstated: {dates: {startDate: '2000-01-01'}}
    },
    {
        type: 'TIME_SERIES',
        days: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        held: ['IMAGE_OUTPUT', 'PIXEL_OBSERVATIONS'],
        free: [],
        model: ({dataSets, from, to}) => timeSeriesModel({dataSets, dates: {startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}}),
        unstated: {dates: {endDate: '2000-01-01'}}
    },
    {
        type: 'PHENOLOGY',
        days: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        held: ['IMAGE_OUTPUT'],
        free: [],
        model: ({dataSets, from, to}) => phenologyModel({dataSets, dates: {fromYear: from, toYear: to}}),
        unstated: {dates: {fromYear: 2000}}
    },
    {
        type: 'LANDTRENDR',
        days: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        // The annual mosaic accompanies the change map these years are fitted to, whatever year it shows.
        held: ['IMAGE_OUTPUT', 'ANNUAL_MOSAIC'],
        free: [],
        model: ({dataSets, from, to}) => landTrendrModel({dataSets, dates: {startYear: from, endYear: to}}),
        unstated: {dates: {startYear: 2000}}
    },
    {
        type: 'CHANGE_ALERTS',
        days: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to}-07-01`}),
        // Its pixel observations are read over both windows at once; its changes and mosaics need each (below).
        held: ['PIXEL_OBSERVATIONS'],
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
        days: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        held: ['IMAGE_OUTPUT'],
        free: [],
        model: ({dataSets, from, to}) => pyeoModel({dataSets, dates: {
            baselineStart: `${from - 1}-01-01`, baselineEnd: `${from}-01-01`, monitoringStart: `${from}-01-01`, monitoringEnd: `${to + 1}-01-01`
        }}),
        unstated: {dates: {monitoringStart: '2000-01-01'}}
    }
]

// Change Alerts reads its imagery under its reference's processing, so its data sets are judged by that (below).
for (const t of TYPES.filter(({type}) => type !== 'CHANGE_ALERTS')) {
    describe(`a ${t.type} whose chosen data sets the catalogue says hold no imagery in the period it reads`, () => {
        for (const operation of t.held) {
            it(`cannot run ${operation}, refused at the data sets, naming the period`, () => {
                const recipe = recipeOf(t, t.model({dataSets: L9, from: 1990, to: 1995}))

                assert.deepEqual(periodFindings(recipe, operation), [
                    {code: 'NO_PERIOD_OVERLAP', path: ['model', 'sources', 'dataSets'], ...t.days(1990, 1995), startYear: 1990, endYear: 1995}
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

// Days, not years: a period within the year a collection ends or begins is judged by its last or first acquisition day,
// each included, the period's own end excluded.
describe('the days a data set may hold imagery for', () => {
    const ccdcOver = (dataSets, startDate, endDate, {corrections = ['SR'], ...sources} = {}) => recipeOf(TYPES[1], {
        ...ccdcModel({dataSets, dates: {startDate, endDate}}),
        ...(Object.keys(sources).length && {sources: {...ccdcModel({dataSets}).sources, ...sources}}),
        options: {corrections}
    })
    const TOA = {corrections: []}

    it('end for Landsat 4-5 under SR with Landsat 5\'s last acquisition, on 5 May 2012', () => {
        assert.deepEqual(codesOf(ccdcOver(TM, '2012-05-05', '2012-05-06')), [])
        assert.deepEqual(codesOf(ccdcOver(TM, '2012-05-06', '2013-01-01')), ['NO_PERIOD_OVERLAP'])
    })

    it('begin for Landsat 8 with its first acquisition, on 18 March 2013, which a period ending that day excludes', () => {
        assert.deepEqual(codesOf(ccdcOver(L8, '2013-01-01', '2013-03-18')), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(ccdcOver(L8, '2013-01-01', '2013-03-19')), [])
    })

    it('hold early 2012 for Landsat 4-5 under SR, but not under TOA, whose Tier 1 ends on 8 November 2011', () => {
        assert.deepEqual(codesOf(ccdcOver(TM, '2012-01-01', '2012-04-01')), [])
        assert.deepEqual(codesOf(ccdcOver(TM, '2012-01-01', '2012-04-01', TOA)), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(ccdcOver(TM, '2011-11-08', '2011-11-09', TOA)), [])
    })

    it('are Tier 2\'s own for its data sets: Landsat 4-5 Tier 2 under TOA ends on 6 February 2001', () => {
        const tier2 = {LANDSAT: ['LANDSAT_TM_T2']}

        assert.deepEqual(codesOf(ccdcOver(tier2, '2001-02-06', '2001-02-07', TOA)), [])
        assert.deepEqual(codesOf(ccdcOver(tier2, '2005-01-01', '2006-01-01', TOA)), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(ccdcOver(tier2, '2005-01-01', '2006-01-01')), [])
    })

    it('end for Landsat 7 with its collections, on 19 January 2024, not with its mission', () => {
        assert.deepEqual(codesOf(ccdcOver(L7, '2024-01-19', '2024-01-20')), [])
        assert.deepEqual(codesOf(ccdcOver(L7, '2024-01-20', '2025-01-01')), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(ccdcOver(L7, '2024-01-20', '2025-01-01', TOA)), ['NO_PERIOD_OVERLAP'])
    })

    it('begin for Sentinel-2 under SR on 28 March 2017, under TOA on 27 June 2015', () => {
        const s2 = {SENTINEL_2: ['SENTINEL_2']}

        assert.deepEqual(codesOf(ccdcOver(s2, '2016-01-01', '2017-03-28')), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(ccdcOver(s2, '2016-01-01', '2017-03-29')), [])
        assert.deepEqual(codesOf(ccdcOver(s2, '2016-01-01', '2017-01-01', TOA)), [])
    })

    it('begin for Sentinel-1 on 3 October 2014, whatever the correction', () => {
        const radar = {dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}

        assert.deepEqual(codesOf(ccdcOver(radar.dataSets, '2014-01-01', '2014-10-03', radar)), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(ccdcOver(radar.dataSets, '2014-01-01', '2014-10-04', radar)), [])
        assert.deepEqual(codesOf(ccdcOver(radar.dataSets, '2014-01-01', '2014-10-04', {...radar, ...TOA})), [])
    })

    it('are not stated for Planet imagery, which is never refused for them', () => {
        const planet = {dataSetType: 'PLANET', dataSets: {PLANET: ['DAILY']}}

        assert.deepEqual(codesOf(ccdcOver(planet.dataSets, '1990-01-01', '1996-01-01', planet)), [])
    })

    it('of Landsat 4-5 run from Landsat 4\'s first acquisition to Landsat 5\'s last, under the correction read', () => {
        assert.deepEqual(dataSetDates('LANDSAT_TM', 'SR'), {fromDate: '1982-08-22', fromYear: 1982, toDate: '2012-05-05', toYear: 2012})
        assert.deepEqual(dataSetDates('LANDSAT_TM', 'TOA'), {fromDate: '1982-08-22', fromYear: 1982, toDate: '2011-11-08', toYear: 2011})
        assert.deepEqual(dataSetDates('LANDSAT_8', 'SR'), {fromDate: '2013-03-18', fromYear: 2013})
    })

    it('are stated for every collection execution reads for a data set Sources offer', () => {
        const unstated = ['SR', 'TOA'].flatMap(reflectance => [...OPTICAL_DATA_SETS, 'SENTINEL_1']
            .filter(dataSet => !dataSetDates(dataSet, reflectance))
            .map(dataSet => `${dataSet} ${reflectance}`))

        assert.deepEqual(unstated, [])
    })
})

// A period of years is its complete calendar years, judged by the same days.
describe('the years a Phenology or LandTrendr reads', () => {
    for (const t of [TYPES[3], TYPES[4]]) {
        const over = (dataSets, from, to, corrections) => recipeOf(t, {...t.model({dataSets, from, to}), options: {...t.model({dataSets, from, to}).options, corrections}})

        it(`are complete calendar years for a ${t.type}, so Landsat 4-5 covers 2012 under SR and not under TOA`, () => {
            assert.deepEqual(codesOf(over(TM, 2012, 2012, ['SR'])), [])
            assert.deepEqual(codesOf(over(TM, 2012, 2012, [])), ['NO_PERIOD_OVERLAP'])
            assert.deepEqual(codesOf(over(TM, 2011, 2012, [])), [])
        })
    }
})

describe('the period an Optical Mosaic reads', () => {
    const mosaicOver = (dataSets, dates, more) => recipeOf(TYPES[0], {...mosaicModel({dataSets, dates}), ...more})

    it('is its season, ending before its exclusive end', () => {
        assert.deepEqual(codesOf(mosaicOver(L8, {seasonStart: '2012-06-01', seasonEnd: '2013-03-18'})), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(mosaicOver(L8, {seasonStart: '2012-06-01', seasonEnd: '2013-03-19'})), [])
    })

    it('is judged under the correction it composites with', () => {
        const early2012 = {seasonStart: '2012-01-01', seasonEnd: '2012-04-01'}

        assert.deepEqual(codesOf(mosaicOver(TM, early2012)), [])
        assert.deepEqual(codesOf(mosaicOver(TM, early2012, {compositeOptions: {corrections: [], compose: 'MEDIAN'}})), ['NO_PERIOD_OVERLAP'])
    })

    it('includes the years before and after the season it composites', () => {
        assert.deepEqual(codesOf(mosaicOver(L8, {...season(2012, 2012), yearsAfter: 1})), [])
        assert.deepEqual(codesOf(mosaicOver(TM, {...season(2015, 2015), yearsBefore: 2})), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(mosaicOver(TM, {...season(2015, 2015), yearsBefore: 3})), [])
    })

    it('spans its seasons\' days, not their years', () => {
        const summers = {targetDate: '2013-07-15', seasonStart: '2013-06-01', seasonEnd: '2013-09-01', yearsBefore: 1}

        assert.deepEqual(codesOf(mosaicOver(TM, summers)), ['NO_PERIOD_OVERLAP'])
        assert.deepEqual(codesOf(mosaicOver(TM, {...summers, yearsBefore: 2})), [])
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

// Change Alerts compares monitoring against calibration (periodDates): its changes, their export and every mosaic its
// layers show need imagery possible in each window, which different data sets chosen may provide, its pixel observations
// in the whole period. A data set covering part of a window covers it. Its imagery is read under the correction its
// reference's processing makes effective (changeAlerts/processing.js), which readiness reads from the reference's
// description - what a segments asset records, observed with its bands, or a computing CCDC's configuration - never its
// own saved options. Calibration 2010-2012 and monitoring 2013-2020 below, over segments recording SR.
describe('the windows a Change Alerts compares', () => {
    const WINDOWS = {
        monitoringEnd: '2021-01-01', monitoringDuration: 96, monitoringDurationUnit: 'months',
        calibrationDuration: 36, calibrationDurationUnit: 'months'
    }
    const CALIBRATION = {window: 'calibration', startDate: '2010-01-01', endDate: '2013-01-01', startYear: 2010, endYear: 2012}
    const MONITORING = {window: 'monitoring', startDate: '2013-01-01', endDate: '2021-01-01', startYear: 2013, endYear: 2020}
    const SEGMENTS = 'users/x/segments'
    const ALERTS = 'change_alerts-1'
    const segments = properties => ({
        bands: ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']
            .map(name => ({name, dataType: {arrayDimensions: name === 'ndvi_coefs' ? 2 : 1}})),
        evidence: [recordedProperties(properties)]
    })
    const RECORDING_SR = segments({dateFormat: 1, surfaceReflectance: true})
    const RECORDING_TOA = segments({dateFormat: 1, surfaceReflectance: false})
    const alerts = (dataSets, date = WINDOWS, saved = ['SR']) => recipeOf(TYPES[5], {...changeAlertsModel({dataSets, date}), options: {corrections: saved}})
    const masking = image => ({
        id: 'masking-1', type: 'MASKING',
        model: {imageToMask: {type: 'RECIPE_REF', id: image.id}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
    })
    // Readiness as a runtime settles it, the reference observed as `observed`, or not yet (null).
    const readinessOver = (recipe, operation, {records = [], observed = RECORDING_SR, recipeObservations = {}} = {}) => readReadiness({
        graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([recipe, ...records].map(record => [record.id, record]))}),
        operation,
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: ({type, id}) => type === 'ASSET' ? (id === SEGMENTS ? observed : undefined) : recipeObservations[id],
        readinessFor: ({type}) => recipeType(type)
    }).readiness
    const coverage = (recipe, operation = 'IMAGE_OUTPUT', over) => (readinessOver(recipe, operation, over).findings || [])
        .filter(({code}) => code === 'NO_PERIOD_OVERLAP')
        .map(({operation: _operation, ...finding}) => finding)
    const uncovered = (windows, recipePath = [ALERTS]) => [{code: 'NO_PERIOD_OVERLAP', path: ['model', 'sources', 'dataSets'], windows, recipePath}]

    // Calibration December 2011 to February 2012, monitoring March and April 2012: Landsat 4-5's surface reflectance
    // covers both, its top of atmosphere neither, so the correction decides.
    const EARLY_2012 = {...WINDOWS, monitoringEnd: '2012-05-01', monitoringDuration: 2, calibrationDuration: 3}
    const EARLY_2012_WINDOWS = [
        {window: 'calibration', startDate: '2011-12-01', endDate: '2012-03-01', startYear: 2011, endYear: 2012},
        {window: 'monitoring', startDate: '2012-03-01', endDate: '2012-05-01', startYear: 2012, endYear: 2012}
    ]

    for (const saved of [['SR'], []]) {
        it(`wait for the reference to be observed where its correction decides, finding nothing until it is, saved ${JSON.stringify(saved)}`, () => {
            const readiness = readinessOver(alerts(TM, EARLY_2012, saved), 'IMAGE_OUTPUT', {observed: null})

            assert.equal(readiness.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(readiness.needs.observations, [{type: 'ASSET', id: SEGMENTS}])
            assert.deepEqual(readiness.findings, [])
        })
    }

    it('settle what was waited for once the reference is observed, by its correction', () => {
        assert.equal(readinessOver(alerts(TM, EARLY_2012), 'IMAGE_OUTPUT', {observed: RECORDING_SR}).status, 'READY')
        assert.deepEqual(coverage(alerts(TM, EARLY_2012), 'IMAGE_OUTPUT', {observed: RECORDING_TOA}), uncovered(EARLY_2012_WINDOWS))
    })

    it('find what no correction changes without waiting for the reference', () => {
        assert.deepEqual(coverage(alerts(L9), 'IMAGE_OUTPUT', {observed: null}), uncovered([CALIBRATION, MONITORING]))
        assert.deepEqual(coverage(alerts(L7, EARLY_2012), 'IMAGE_OUTPUT', {observed: null}), [])
    })

    for (const operation of ['IMAGE_OUTPUT', 'COLLECTION_MOSAIC']) {
        it(`refuse ${operation} over Landsat 8 alone, naming the calibration window`, () => {
            assert.deepEqual(coverage(alerts(L8), operation), uncovered([CALIBRATION]))
        })

        it(`refuse ${operation} over Landsat 4-5 alone, naming the monitoring window`, () => {
            assert.deepEqual(coverage(alerts(TM), operation), uncovered([MONITORING]))
        })

        it(`run ${operation} over Landsat 4-5 and 8 together, each covering one window`, () => {
            assert.deepEqual(coverage(alerts({LANDSAT: ['LANDSAT_8', 'LANDSAT_TM']}), operation), [])
        })
    }

    it('are covered where a data set covers only part of a window', () => {
        assert.deepEqual(coverage(alerts(L8, {...WINDOWS, monitoringEnd: '2021-07-01', calibrationDuration: 12})), [])
    })

    it('end the monitoring window before its exclusive end', () => {
        const date = monitoringEnd => ({...WINDOWS, monitoringEnd, monitoringDuration: 1, calibrationDuration: 1})

        assert.deepEqual(coverage(alerts(L8, date('2013-03-18'))), uncovered([
            {window: 'calibration', startDate: '2013-01-18', endDate: '2013-02-18', startYear: 2013, endYear: 2013},
            {window: 'monitoring', startDate: '2013-02-18', endDate: '2013-03-18', startYear: 2013, endYear: 2013}
        ]))
        assert.deepEqual(coverage(alerts(L8, date('2013-03-19'))), uncovered([
            {window: 'calibration', startDate: '2013-01-19', endDate: '2013-02-19', startYear: 2013, endYear: 2013}
        ]))
    })

    // Calibration from September to November 2012, monitoring December 2012 and January 2013: after Landsat 4-5's last
    // acquisition and before Landsat 8's first, whatever their years.
    describe('between Landsat 4-5\'s last acquisition and Landsat 8\'s first', () => {
        const GAP = {
            monitoringEnd: '2013-02-01', monitoringDuration: 2, monitoringDurationUnit: 'months',
            calibrationDuration: 3, calibrationDurationUnit: 'months'
        }
        const BOTH = [
            {window: 'calibration', startDate: '2012-09-01', endDate: '2012-12-01', startYear: 2012, endYear: 2012},
            {window: 'monitoring', startDate: '2012-12-01', endDate: '2013-02-01', startYear: 2012, endYear: 2013}
        ]

        for (const [name, dataSets] of [['Landsat 4-5', TM], ['Landsat 8', L8], ['Landsat 4-5 and 8 together', {LANDSAT: ['LANDSAT_TM', 'LANDSAT_8']}]]) {
            it(`are refused over ${name}, naming both windows`, () => {
                assert.deepEqual(coverage(alerts(dataSets, GAP)), uncovered(BOTH))
            })
        }

        it('are covered by Landsat 7', () => {
            assert.deepEqual(coverage(alerts(L7, GAP)), [])
        })
    })

    // Calibration December 2011 to February 2012, monitoring March and April 2012: Landsat 4-5's surface reflectance covers
    // both, its top of atmosphere, ending on 8 November 2011, neither.
    describe('under the correction the reference reads, not the one saved', () => {
        const BOTH = EARLY_2012_WINDOWS

        it('are covered by Landsat 4-5 saved top of atmosphere where the segments record SR', () => {
            assert.deepEqual(coverage(alerts(TM, EARLY_2012, []), 'IMAGE_OUTPUT', {observed: RECORDING_SR}), [])
        })

        it('are refused over Landsat 4-5 saved with SR where the segments record top of atmosphere', () => {
            assert.deepEqual(coverage(alerts(TM, EARLY_2012, ['SR']), 'IMAGE_OUTPUT', {observed: RECORDING_TOA}), uncovered(BOTH))
        })

        it('follow the correction saved where the segments record none', () => {
            const recordingNothing = segments({dateFormat: 1})

            assert.deepEqual(coverage(alerts(TM, EARLY_2012, ['SR']), 'IMAGE_OUTPUT', {observed: recordingNothing}), [])
            assert.deepEqual(coverage(alerts(TM, EARLY_2012, []), 'IMAGE_OUTPUT', {observed: recordingNothing}), uncovered(BOTH))
        })

        it('leave processing that cannot be read to what refuses it, judging nothing', () => {
            const unreadable = segments({dateFormat: 1, surfaceReflectance: 'yes'})

            assert.deepEqual(coverage(alerts(TM, EARLY_2012, []), 'IMAGE_OUTPUT', {observed: unreadable}), [])
        })

        it('are judged by a computing CCDC\'s own correction where it is the reference', () => {
            const ccdc = {id: 'ccdc-1', type: 'CCDC', model: {
                ...ccdcModel({dataSets: {LANDSAT: ['LANDSAT_7']}, dates: {startDate: '2005-01-01', endDate: '2012-01-01'}}),
                aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
                options: {corrections: []}
            }}
            const recipe = {...alerts(TM, EARLY_2012, ['SR']), model: {...alerts(TM, EARLY_2012, ['SR']).model, reference: {type: 'RECIPE_REF', id: ccdc.id}}}
            const over = {records: [ccdc], recipeObservations: {[ccdc.id]: {bands: ['tStart', 'tEnd', 'ndvi_coefs'].map(name => ({name}))}}}

            assert.deepEqual(coverage(recipe, 'IMAGE_OUTPUT', over), uncovered(BOTH))
        })
    })

    // A recipe whose image is the changes - a Masking of them - is held by what holds them, found on the way to them.
    describe('reached through a recipe building their image', () => {
        it('hold the Masking, naming the Change Alerts on the way', () => {
            const changes = alerts(L9)

            assert.deepEqual(coverage(masking(changes), 'IMAGE_OUTPUT', {records: [changes]}), uncovered([CALIBRATION, MONITORING], ['masking-1', ALERTS]))
        })

        it('let the Masking wait while the reference whose correction decides is not observed, whatever was saved', () => {
            for (const saved of [['SR'], []]) {
                const changes = alerts(TM, EARLY_2012, saved)
                const readiness = readinessOver(masking(changes), 'IMAGE_OUTPUT', {records: [changes], observed: null})

                assert.equal(readiness.status, 'NEEDS_EVIDENCE')
                assert.deepEqual(readiness.findings, [])
            }
        })

        it('let the Masking run where the segments\' correction covers what the saved one would not, and hold it where it does not', () => {
            const changes = alerts(TM, EARLY_2012, [])
            const saved = alerts(TM, EARLY_2012, ['SR'])

            assert.equal(readinessOver(masking(changes), 'IMAGE_OUTPUT', {records: [changes], observed: RECORDING_SR}).status, 'READY')
            assert.deepEqual(
                coverage(masking(saved), 'IMAGE_OUTPUT', {records: [saved], observed: RECORDING_TOA}),
                uncovered(EARLY_2012_WINDOWS, ['masking-1', ALERTS])
            )
        })
    })

    it('are read at once for pixel observations, refused only where neither window is covered', () => {
        assert.deepEqual(coverage(alerts(L8), 'PIXEL_OBSERVATIONS'), [])
        assert.deepEqual(coverage(alerts(L9), 'PIXEL_OBSERVATIONS'), [{
            code: 'NO_PERIOD_OVERLAP', path: ['model', 'sources', 'dataSets'],
            startDate: '2010-01-01', endDate: '2021-01-01', startYear: 2010, endYear: 2020, recipePath: [ALERTS]
        }])
    })

    it('do not hold the reference\'s segments, which read none of its imagery', () => {
        assert.deepEqual(coverage(alerts(L9), 'PIXEL_SEGMENTS'), [])
    })

    it('judge nothing while its period is not fully stated, or no data set is chosen', () => {
        assert.deepEqual(coverage(alerts(L8, {monitoringEnd: '2021-01-01'})), [])
        assert.deepEqual(coverage(alerts({})), [])
    })
})

// While the correction is not known, a data set is excluded only where neither correction's collections may hold
// imagery: Landsat 4-5's surface reflectance reaches May 2012, its top of atmosphere November 2011.
describe('a period whose correction is not known', () => {
    const excluded = (startDate, endDate, reflectance) => excludedDataSets(['LANDSAT_TM'], periodOfDates(startDate, endDate, {reflectance}))

    it('excludes a data set only where neither correction may cover it', () => {
        assert.deepEqual(excluded('2012-01-01', '2012-04-01', 'TOA'), ['LANDSAT_TM'])
        assert.deepEqual(excluded('2012-01-01', '2012-04-01', null), [])
        assert.deepEqual(excluded('2012-09-01', '2012-12-01', null), ['LANDSAT_TM'])
    })

    it('gives a data set the days of either correction', () => {
        assert.deepEqual(dataSetDates('LANDSAT_TM', null), {fromDate: '1982-08-22', fromYear: 1982, toDate: '2012-05-05', toYear: 2012})
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
    it('is its days, in the years from its start to the day before its exclusive end, read top of atmosphere unless said', () => {
        assert.deepEqual(periodOfDates('2012-03-01', '2014-01-01'), {
            startDate: '2012-03-01', endDate: '2014-01-01', startYear: 2012, endYear: 2013, reflectance: 'TOA'
        })
        assert.deepEqual(periodOfDates('2012-03-01', '2014-01-02', {reflectance: 'SR'}), {
            startDate: '2012-03-01', endDate: '2014-01-02', startYear: 2012, endYear: 2014, reflectance: 'SR'
        })
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
    it('is the days of both its years, complete', () => {
        assert.deepEqual(periodOfYears(2012, 2013, {reflectance: 'SR'}), {
            startDate: '2012-01-01', endDate: '2014-01-01', startYear: 2012, endYear: 2013, reflectance: 'SR'
        })
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
    return {
        reference: {type: 'ASSET', id: 'users/x/segments'},
        date,
        sources: {...optical(dataSets), band: 'ndvi'},
        options: {corrections: ['SR']},
        changeAlertsOptions: {}
    }
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
