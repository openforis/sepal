import {jest} from '@jest/globals'

const query = jest.fn()
const mockPool = {query}

jest.unstable_mockModule('#sepal/db/mysql', () => ({
    createPool: jest.fn().mockResolvedValue(mockPool)
}))

jest.unstable_mockModule('./database.js', () => ({
    SCHEMA: 'scene_metadata'
}))

const {findScenesInSceneArea, findBestScenes, selectBest} = await import('./sceneRepository.js')

beforeEach(() => {
    query.mockReset()
})

// Base query used by most SQL tests (non-wrap season: fromDate < toDate so start < end)
const NON_WRAP_QUERY = {
    sceneAreaId: 'SA_042',
    source: 'LANDSAT',
    dataSets: ['LANDSAT_8', 'LANDSAT_9'],
    fromDate: '2018-06-01',  // doy 152 (leap-ignoring)
    toDate: '2021-09-30',    // doy 272 (leap-ignoring)
    targetDayOfYear: 196,
    targetDayOfYearWeight: 0.5,
}

// Wrap-around season: end of year → start of year (e.g. Nov → Feb)
const WRAP_QUERY = {
    ...NON_WRAP_QUERY,
    fromDate: '2018-11-01',  // doy 304 (leap-ignoring in non-leap) / 305 raw in leap
    toDate: '2021-02-28',    // doy 59 (Feb 28)
}

describe('selectBest', () => {
    const mkRow = cloudCover => ({cloud_cover: cloudCover})

    test('empty input returns empty array', () => {
        expect(selectBest([], {minScenes: 1, maxScenes: 10, cloudCoverTarget: 0.1})).toEqual([])
    })

    test('stops after maxScenes regardless of cloudCover', () => {
        // cloudCover=80% → cumulative stays > cloudCoverTarget=0.1 for many scenes
        // maxScenes=2 caps at 2: after 2nd push, maxScenes(2) <= scenes.length(2) → break
        const rows = [mkRow(80), mkRow(80), mkRow(80), mkRow(80)]
        const result = selectBest(rows, {minScenes: 1, maxScenes: 2, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(2)
    })

    test('includes at least minScenes even when cloudCover is 0', () => {
        // cloudCover=0 → cumulative=0 immediately; but minScenes=3 forces 3 scenes
        const rows = [mkRow(0), mkRow(0), mkRow(0), mkRow(0)]
        const result = selectBest(rows, {minScenes: 3, maxScenes: 10, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(3)
    })

    test('stops as soon as cumulative <= cloudCoverTarget and >= minScenes', () => {
        // Scene 1: cloudCover=5 → cumulative=0.05 ≤ 0.1, scenes.length=1 >= minScenes=1 → stop
        const rows = [mkRow(5), mkRow(5), mkRow(5)]
        const result = selectBest(rows, {minScenes: 1, maxScenes: 10, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(1)
    })

    test('continues while cumulative > cloudCoverTarget', () => {
        // Scene 1: cloudCover=50 → cumulative=0.5 > 0.1 → continue
        // Scene 2: cloudCover=50 → cumulative=0.25 > 0.1 → continue
        // Scene 3: cloudCover=50 → cumulative=0.125 > 0.1 → continue
        // Scene 4: cloudCover=50 → cumulative=0.0625 ≤ 0.1, length=4 >= 1 → stop
        const rows = [mkRow(50), mkRow(50), mkRow(50), mkRow(50), mkRow(50)]
        const result = selectBest(rows, {minScenes: 1, maxScenes: 10, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(4)
    })

    test('minScenes overrides early stop (minScenes=3 forces 3 despite low cloud)', () => {
        // Scene 1: cloudCover=5 → cumulative=0.05 ≤ 0.1, but length=1 < minScenes=3 → continue
        // Scene 2: cloudCover=5 → cumulative=0.0025 ≤ 0.1, but length=2 < 3 → continue
        // Scene 3: cloudCover=5 → cumulative tiny, length=3 >= 3 → stop
        const rows = [mkRow(5), mkRow(5), mkRow(5), mkRow(5)]
        const result = selectBest(rows, {minScenes: 3, maxScenes: 10, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(3)
    })

    test('maxScenes=1 returns at most 1 scene', () => {
        const rows = [mkRow(80), mkRow(80)]
        const result = selectBest(rows, {minScenes: 1, maxScenes: 1, cloudCoverTarget: 0.5})
        expect(result).toHaveLength(1)
    })

    test('returns rows with cloud_cover accessible (raw rows passed through)', () => {
        const row = {cloud_cover: 20, id: 'abc'}
        const result = selectBest([row], {minScenes: 1, maxScenes: 5, cloudCoverTarget: 0.5})
        expect(result[0]).toBe(row)
    })
})

describe('findScenesInSceneArea - SQL shape', () => {
    beforeEach(() => {
        query.mockResolvedValue([[]])
    })

    test('executes a query and returns mapped rows', async () => {
        const rawRow = {
            id: 'SC001',
            meta_data_source: 'LANDSAT',
            sensor_id: 'LANDSAT_8',
            scene_area_id: 'SA_042',
            acquisition_date: new Date('2020-07-15T00:00:00Z'),
            cloud_cover: 15.5,
            sun_azimuth: 120.3,
            sun_elevation: 45.1,
            update_time: new Date('2020-07-16T00:00:00Z'),
        }
        query.mockResolvedValueOnce([[rawRow]])
        const rows = await findScenesInSceneArea(NON_WRAP_QUERY)
        expect(rows).toHaveLength(1)
        const r = rows[0]
        expect(r.id).toBe('SC001')
        expect(r.source).toBe('LANDSAT')
        expect(r.sceneAreaId).toBe('SA_042')
        expect(r.dataSet).toBe('LANDSAT_8')
        expect(r.cloudCover).toBe(15.5)
        expect(r.sunAzimuth).toBe(120.3)
        expect(r.sunElevation).toBe(45.1)
    })

    test('SELECT includes sort_weight expression with (1.0 - ?) * cloud_cover / 100.0 + ? * LEAST(ABS(day_of_year - ?), ...)', async () => {
        await findScenesInSceneArea(NON_WRAP_QUERY)
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/\(1\.0 - \?\) \* cloud_cover \/ 100\.0 \+ \? \* LEAST\(ABS\(day_of_year - \?\), 365\.0 - ABS\(day_of_year - \?\)\) \/ 182\.0 AS sort_weight/i)
    })

    test('SELECT includes days_from_target_date expression', async () => {
        await findScenesInSceneArea(NON_WRAP_QUERY)
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/LEAST\(ABS\(day_of_year - \?\), 365\.0 - ABS\(day_of_year - \?\)\) AS days_from_target_date/i)
    })

    test('non-wrap: day_of_year constraint is AND (>= ? AND < ?)', async () => {
        await findScenesInSceneArea(NON_WRAP_QUERY)
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/\(day_of_year >= \? AND day_of_year < \?\)/i)
        expect(sql).not.toMatch(/day_of_year >= \? OR/i)
    })

    test('wrap: day_of_year constraint is OR (>= ? OR < ?)', async () => {
        await findScenesInSceneArea(WRAP_QUERY)
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/\(day_of_year >= \? OR day_of_year < \?\)/i)
        expect(sql).not.toMatch(/day_of_year >= \? AND day_of_year < \?/i)
    })

    test('sensor_id IN placeholder count matches dataSets length', async () => {
        await findScenesInSceneArea(NON_WRAP_QUERY)
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/sensor_id IN \(\?, \?\)/i)
    })

    test('acquisition_date has three conditions (>= from, <= to, <= latestAcquisitionDate)', async () => {
        await findScenesInSceneArea(NON_WRAP_QUERY)
        const [sql] = query.mock.calls[0]
        const matches = [...sql.matchAll(/acquisition_date/gi)]
        expect(matches.length).toBeGreaterThanOrEqual(3)
        expect(sql).toMatch(/acquisition_date >= \?/i)
        expect(sql).toMatch(/acquisition_date <= \?.*AND acquisition_date <= \?/is)
    })

    test('ORDER BY sort_weight, cloud_cover, days_from_target_date', async () => {
        await findScenesInSceneArea(NON_WRAP_QUERY)
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/ORDER BY sort_weight, cloud_cover, days_from_target_date/i)
    })

    // -----------------------------------------------------------------------
    // Param order (non-wrap)
    // [w, w, t, t, t, t, sceneAreaId, fromDate, toDate, latestAcqDate, seasonStartDoy, seasonEndDoy, ...dataSets]
    // -----------------------------------------------------------------------

    test('non-wrap: param order matches spec exactly', async () => {
        const q = NON_WRAP_QUERY
        await findScenesInSceneArea(q)
        const [, params] = query.mock.calls[0]
        const w = q.targetDayOfYearWeight  // 0.5
        const t = q.targetDayOfYear         // 196
        expect(params[0]).toBe(w)
        expect(params[1]).toBe(w)
        expect(params[2]).toBe(t)
        expect(params[3]).toBe(t)
        expect(params[4]).toBe(t)
        expect(params[5]).toBe(t)
        expect(params[6]).toBe(q.sceneAreaId)
        expect(params[7]).toBe(q.fromDate)
        expect(params[8]).toBe(q.toDate)
        const latestAcqDate = params[9]
        expect(latestAcqDate).toBeInstanceOf(Date)
        const tenDaysAgoApprox = Date.now() - 10 * 24 * 60 * 60 * 1000
        expect(Math.abs(latestAcqDate.getTime() - tenDaysAgoApprox)).toBeLessThan(5000)
        // params[10] = seasonStartDoy (dayOfYearIgnoringLeapDay('2018-06-01'))
        // 2018 is not a leap year; Jun 1 = 31+28+31+30+31+1 = 152
        expect(params[10]).toBe(152)
        // params[11] = seasonEndDoy (dayOfYearIgnoringLeapDay('2021-09-30'))
        // 2021 is not a leap year; Sep 30 = 31+28+31+30+31+30+31+31+30 = 273
        expect(params[11]).toBe(273)
        expect(params[12]).toBe('LANDSAT_8')
        expect(params[13]).toBe('LANDSAT_9')
        expect(params).toHaveLength(14)
    })

    test('wrap: param order matches spec exactly', async () => {
        const q = WRAP_QUERY
        await findScenesInSceneArea(q)
        const [, params] = query.mock.calls[0]
        const w = q.targetDayOfYearWeight
        const t = q.targetDayOfYear
        expect(params[0]).toBe(w)
        expect(params[1]).toBe(w)
        expect(params[2]).toBe(t)
        expect(params[3]).toBe(t)
        expect(params[4]).toBe(t)
        expect(params[5]).toBe(t)
        expect(params[6]).toBe(q.sceneAreaId)
        expect(params[7]).toBe(q.fromDate)
        expect(params[8]).toBe(q.toDate)
        expect(params[9]).toBeInstanceOf(Date)
        // fromDate '2018-11-01': 2018 non-leap; Nov 1 = 31+28+31+30+31+30+31+31+30+31+1 = 305
        expect(params[10]).toBe(305)
        // toDate '2021-02-28': 2021 non-leap; Feb 28 = 31+28 = 59
        expect(params[11]).toBe(59)
        expect(params[12]).toBe('LANDSAT_8')
        expect(params[13]).toBe('LANDSAT_9')
    })

    test('wrap: detected when seasonStartDoy >= seasonEndDoy', async () => {
        // Nov 1 (305) >= Feb 28 (59) → wrap=true → OR constraint
        await findScenesInSceneArea(WRAP_QUERY)
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/OR day_of_year < \?/i)
    })

    test('single dataSet: IN (?) — one placeholder', async () => {
        await findScenesInSceneArea({...NON_WRAP_QUERY, dataSets: ['LANDSAT_8']})
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/sensor_id IN \(\?\)/i)
    })

    test('three dataSets: IN (?, ?, ?)', async () => {
        await findScenesInSceneArea({...NON_WRAP_QUERY, dataSets: ['L8', 'L9', 'L7']})
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/sensor_id IN \(\?, \?, \?\)/i)
    })
})

describe('findBestScenes', () => {
    const BEST_QUERY = {
        ...NON_WRAP_QUERY,
        sceneAreaIds: ['SA_042', 'SA_043'],
        cloudCoverTarget: 0.1,
        minScenes: 1,
        maxScenes: 5,
    }

    test('returns an object keyed by sceneAreaId', async () => {
        query.mockResolvedValue([[]])
        const result = await findBestScenes(BEST_QUERY)
        expect(typeof result).toBe('object')
        expect('SA_042' in result).toBe(true)
        expect('SA_043' in result).toBe(true)
    })

    test('applies selectBest greedy per area', async () => {
        const mkRaw = cc => ({
            id: `id_${cc}`,
            meta_data_source: 'LANDSAT',
            sensor_id: 'LANDSAT_8',
            scene_area_id: 'SA_042',
            acquisition_date: new Date('2020-07-15T00:00:00Z'),
            cloud_cover: cc,
            sun_azimuth: 100,
            sun_elevation: 50,
            update_time: new Date(),
        })
        // Two areas; SA_042 gets one 5%-cc scene (cumulative 0.05 ≤ 0.1, length=1 ≥ 1 → 1 scene)
        // SA_043 gets rows with 60% cc (cumulative keeps > 0.1)
        const rows042 = [mkRaw(5)]
        const rows043 = [mkRaw(60), mkRaw(60), mkRaw(60)]
        query
            .mockResolvedValueOnce([rows042])
            .mockResolvedValueOnce([rows043])
        const result = await findBestScenes(BEST_QUERY)
        expect(result['SA_042']).toHaveLength(1)
        // SA_043: 0.6 > 0.1 → continue; 0.36 > 0.1 → continue; 0.216 > 0.1 → continue; no more rows → 3
        expect(result['SA_043']).toHaveLength(3)
    })

    test('scene objects from findBestScenes have mapped shape', async () => {
        const rawRow = {
            id: 'SC001',
            meta_data_source: 'LANDSAT',
            sensor_id: 'LANDSAT_8',
            scene_area_id: 'SA_042',
            acquisition_date: new Date('2020-07-15T00:00:00Z'),
            cloud_cover: 15.5,
            sun_azimuth: 120.3,
            sun_elevation: 45.1,
            update_time: new Date('2020-07-16T00:00:00Z'),
        }
        query.mockResolvedValue([[rawRow]])
        const result = await findBestScenes({...BEST_QUERY, sceneAreaIds: ['SA_042']})
        const scene = result['SA_042'][0]
        expect(scene.id).toBe('SC001')
        expect(scene.source).toBe('LANDSAT')
        expect(scene.sceneAreaId).toBe('SA_042')
        expect(scene.dataSet).toBe('LANDSAT_8')
        expect(scene.cloudCover).toBe(15.5)
        expect(scene.acquisitionDate).toBeInstanceOf(Date)
    })
})
