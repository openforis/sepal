import {
    addYears,
    dayOfYearIgnoringLeapDay,
    daysFromDayOfYear,
    parseBestScenesQuery,
    parseSceneAreaQuery,
    seasonDayOfYearConstraint,
    subYears,
    toDateString,
} from './sceneSearch.js'

test('toDateString formats a Date as yyyy-MM-dd', () => {
    expect(toDateString(new Date(Date.UTC(2021, 5, 15)))).toBe('2021-06-15')
})

test('toDateString formats Jan 1', () => {
    expect(toDateString(new Date(Date.UTC(2020, 0, 1)))).toBe('2020-01-01')
})

test('toDateString accepts a yyyy-MM-dd string', () => {
    expect(toDateString('2023-03-07')).toBe('2023-03-07')
})

test('addYears adds calendar years', () => {
    expect(toDateString(addYears('2020-06-15', 2))).toBe('2022-06-15')
})

test('subYears subtracts calendar years', () => {
    expect(toDateString(subYears('2020-06-15', 3))).toBe('2017-06-15')
})

test('addYears 0 is identity', () => {
    expect(toDateString(addYears('2021-11-30', 0))).toBe('2021-11-30')
})

test('subYears handles end-of-month in non-leap-year', () => {
    expect(toDateString(subYears('2020-02-29', 1))).toBe('2019-02-28')
})

test('dayOfYearIgnoringLeapDay: Jan 1 -> 1 (non-leap)', () => {
    expect(dayOfYearIgnoringLeapDay('2021-01-01')).toBe(1)
})

test('dayOfYearIgnoringLeapDay: Jan 1 -> 1 (leap year)', () => {
    expect(dayOfYearIgnoringLeapDay('2020-01-01')).toBe(1)
})

test('dayOfYearIgnoringLeapDay: Feb 28 -> 59 in leap year (day 60 raw, but <= 60 so no shift... wait: dayOfYear=59, not > 60)', () => {
    // Feb 28 2020 is day 59 (< 60), no shift
    expect(dayOfYearIgnoringLeapDay('2020-02-28')).toBe(59)
})

test('dayOfYearIgnoringLeapDay: Feb 29 (leap day itself) -> not shifted (dayOfYear=60, NOT > 60)', () => {
    // Feb 29 2020 is day 60, condition is dayOfYear > 60, so NOT shifted
    expect(dayOfYearIgnoringLeapDay('2020-02-29')).toBe(60)
})

test('dayOfYearIgnoringLeapDay: Mar 1 -> shifted back by 1 in leap year', () => {
    // Mar 1 2020 is day 61 (raw), shifted to 60
    expect(dayOfYearIgnoringLeapDay('2020-03-01')).toBe(60)
})

test('dayOfYearIgnoringLeapDay: Jun 15 -> shifted back by 1 in leap year', () => {
    // Jun 15 2020: days Jan(31)+Feb(29)+Mar(31)+Apr(30)+May(31)+15 = 167 raw, shifted to 166
    expect(dayOfYearIgnoringLeapDay('2020-06-15')).toBe(166)
})

test('dayOfYearIgnoringLeapDay: Jun 15 in non-leap year is unchanged', () => {
    // Jun 15 2021: days Jan(31)+Feb(28)+Mar(31)+Apr(30)+May(31)+15 = 166
    expect(dayOfYearIgnoringLeapDay('2021-06-15')).toBe(166)
})

test('dayOfYearIgnoringLeapDay: Dec 31 in non-leap year -> 365', () => {
    expect(dayOfYearIgnoringLeapDay('2021-12-31')).toBe(365)
})

test('dayOfYearIgnoringLeapDay: Dec 31 in leap year -> 365 (366 raw, shifted to 365)', () => {
    expect(dayOfYearIgnoringLeapDay('2020-12-31')).toBe(365)
})

test('daysFromDayOfYear: same day -> 0', () => {
    expect(daysFromDayOfYear('2021-06-15', 166)).toBe(0)
})

test('daysFromDayOfYear: 5 days apart (no wrap)', () => {
    // doy 10 vs 5: |10-5|=5, min(5, 360)=5
    expect(daysFromDayOfYear('2021-01-10', 5)).toBe(5)
})

test('daysFromDayOfYear: wrap-around min — doy 5 vs 360 -> 10', () => {
    // Jan 5 is day 5; target=360; |5-360|=355, min(355, 365-355)=min(355,10)=10
    expect(daysFromDayOfYear('2021-01-05', 360)).toBe(10)
})

test('daysFromDayOfYear: wrap-around, target at day 362, date at day 3', () => {
    // |3-362|=359, min(359, 365-359)=min(359,6)=6
    expect(daysFromDayOfYear('2021-01-03', 362)).toBe(6)
})

test('daysFromDayOfYear: exactly 182 apart -> 182', () => {
    // 182 is the max meaningful (half of 365), min(182, 183)=182
    expect(daysFromDayOfYear('2021-01-01', 183)).toBe(182)
})

const REPRESENTATIVE_CLIENT_QUERY = {
    sceneAreaIds: ['SA_001', 'SA_002'],
    sources: {
        dataSets: {
            LANDSAT: ['LANDSAT_8', 'LANDSAT_9'],
            SENTINEL_2: ['SENTINEL_2A']
        }
    },
    dates: {
        seasonStart: '2020-06-01',
        seasonEnd: '2020-09-30',
        targetDate: '2020-07-15',
        yearsBefore: 2,
        yearsAfter: 1
    },
    sceneSelectionOptions: {
        targetDateWeight: 0.5
    },
    cloudCoverTarget: 0.1,
    sceneCount: {
        min: 1,
        max: 10
    }
}

test('parseBestScenesQuery: source is first key of sources.dataSets', () => {
    const q = parseBestScenesQuery(REPRESENTATIVE_CLIENT_QUERY)
    expect(q.source).toBe('LANDSAT')
})

test('parseBestScenesQuery: sceneAreaIds passed through', () => {
    const q = parseBestScenesQuery(REPRESENTATIVE_CLIENT_QUERY)
    expect(q.sceneAreaIds).toEqual(['SA_001', 'SA_002'])
})

test('parseBestScenesQuery: dataSets is flattened values of sources.dataSets', () => {
    const q = parseBestScenesQuery(REPRESENTATIVE_CLIENT_QUERY)
    expect(q.dataSets).toEqual(['LANDSAT_8', 'LANDSAT_9', 'SENTINEL_2A'])
})

test('parseBestScenesQuery: fromDate = subYears(seasonStart, yearsBefore)', () => {
    const q = parseBestScenesQuery(REPRESENTATIVE_CLIENT_QUERY)
    // 2020-06-01 - 2 years = 2018-06-01
    expect(q.fromDate).toBe('2018-06-01')
})

test('parseBestScenesQuery: toDate = addYears(seasonEnd, yearsAfter)', () => {
    const q = parseBestScenesQuery(REPRESENTATIVE_CLIENT_QUERY)
    // 2020-09-30 + 1 year = 2021-09-30
    expect(q.toDate).toBe('2021-09-30')
})

test('parseBestScenesQuery: targetDayOfYear = dayOfYearIgnoringLeapDay(targetDate)', () => {
    const q = parseBestScenesQuery(REPRESENTATIVE_CLIENT_QUERY)
    // 2020-07-15 is leap year: Jul = 31+29+31+30+31+30+15 = 197 raw, shifted to 196
    expect(q.targetDayOfYear).toBe(196)
})

test('parseBestScenesQuery: targetDayOfYearWeight from sceneSelectionOptions', () => {
    const q = parseBestScenesQuery(REPRESENTATIVE_CLIENT_QUERY)
    expect(q.targetDayOfYearWeight).toBe(0.5)
})

test('parseBestScenesQuery: cloudCoverTarget passed through', () => {
    const q = parseBestScenesQuery(REPRESENTATIVE_CLIENT_QUERY)
    expect(q.cloudCoverTarget).toBe(0.1)
})

test('parseBestScenesQuery: minScenes and maxScenes from sceneCount', () => {
    const q = parseBestScenesQuery(REPRESENTATIVE_CLIENT_QUERY)
    expect(q.minScenes).toBe(1)
    expect(q.maxScenes).toBe(10)
})

test('parseSceneAreaQuery: includes sceneAreaId and same date fields', () => {
    const q = parseSceneAreaQuery('SA_001', REPRESENTATIVE_CLIENT_QUERY)
    expect(q.sceneAreaId).toBe('SA_001')
    expect(q.source).toBe('LANDSAT')
    expect(q.dataSets).toEqual(['LANDSAT_8', 'LANDSAT_9', 'SENTINEL_2A'])
    expect(q.fromDate).toBe('2018-06-01')
    expect(q.toDate).toBe('2021-09-30')
    expect(q.targetDayOfYear).toBe(196)
    expect(typeof q.targetDayOfYearWeight).toBe('number')
    expect(q.targetDayOfYearWeight).toBe(0.5)
})

test('parseSceneAreaQuery: no cloudCoverTarget, minScenes, maxScenes', () => {
    const q = parseSceneAreaQuery('SA_001', REPRESENTATIVE_CLIENT_QUERY)
    expect(q.cloudCoverTarget).toBeUndefined()
    expect(q.minScenes).toBeUndefined()
    expect(q.maxScenes).toBeUndefined()
})

test('seasonDayOfYearConstraint: start < end -> wrap=false', () => {
    const r = seasonDayOfYearConstraint(60, 200)
    expect(r.wrap).toBe(false)
})

test('seasonDayOfYearConstraint: start >= end -> wrap=true', () => {
    const r = seasonDayOfYearConstraint(300, 60)
    expect(r.wrap).toBe(true)
})

test('seasonDayOfYearConstraint: start === end -> wrap=true', () => {
    const r = seasonDayOfYearConstraint(100, 100)
    expect(r.wrap).toBe(true)
})
