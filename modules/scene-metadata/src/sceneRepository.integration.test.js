import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {SceneRepository} from './sceneRepository.js'

// The ranking is a SQL expression over cloud cover and day of year, so what it actually orders is only
// observable against MySQL. Scenes are written directly because the ingester owns every write to this
// table, through a bulk load and a table swap this repository never performs.

describe('SceneRepository', () => {
    let testDb
    let repository
    let now

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'scene_metadata', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        now = new Date('2021-10-01T00:00:00Z')
        repository = new SceneRepository(testDb.db, () => now)
    })

    afterAll(() => testDb?.remove())

    describe('findScenesInSceneArea', () => {
        test('reports the scenes of that area alone', async () => {
            await givenScene({id: 'here', sceneAreaId: SCENE_AREA_ID})
            await givenScene({id: 'elsewhere', sceneAreaId: 'SA_999'})

            const found = await repository.findScenesInSceneArea(aQuery())

            expect(found.map(({id}) => id)).toEqual(['here'])
        })

        test('reports a scene as the client describes it', async () => {
            await givenScene({
                id: 'SC001', cloudCover: 15, sunAzimuth: 130.5, sunElevation: 55.25,
                acquisitionDate: '2020-07-15 00:00:00'
            })

            const [scene] = await repository.findScenesInSceneArea(aQuery())

            expect(scene).toEqual({
                id: 'SC001',
                source: SOURCE,
                sceneAreaId: SCENE_AREA_ID,
                dataSet: 'LANDSAT_8',
                acquisitionDate: new Date('2020-07-15T00:00:00Z'),
                cloudCover: 15,
                sunAzimuth: 130.5,
                sunElevation: 55.25,
                updateTime: expect.any(Date),
                cloud_cover: 15,
            })
        })

        test('reports only the data sets that were asked for', async () => {
            await givenScene({id: 'asked-for', dataSet: 'LANDSAT_8'})
            await givenScene({id: 'also-asked-for', dataSet: 'LANDSAT_9'})
            await givenScene({id: 'not-asked-for', dataSet: 'SENTINEL_2A'})

            const found = await repository.findScenesInSceneArea(aQuery({dataSets: ['LANDSAT_8', 'LANDSAT_9']}))

            expect(found.map(({id}) => id).sort()).toEqual(['also-asked-for', 'asked-for'])
        })

        // Every scene here is mid-season and long settled, so the requested years are the only thing
        // that can exclude one — a clock nearer the later scene would hold it back regardless.
        test('reports only the scenes acquired within the requested years', async () => {
            now = new Date('2023-01-01T00:00:00Z')
            await givenScene({id: 'before', acquisitionDate: '2017-07-15 00:00:00', dayOfYear: 196})
            await givenScene({id: 'within', acquisitionDate: '2020-07-15 00:00:00', dayOfYear: 196})
            await givenScene({id: 'after', acquisitionDate: '2022-07-15 00:00:00', dayOfYear: 196})

            const found = await repository.findScenesInSceneArea(aQuery())

            expect(found.map(({id}) => id)).toEqual(['within'])
        })

        // Metadata for a scene keeps arriving for days after it was taken, so the most recent ten days
        // are held back rather than answered from an incomplete record.
        test('holds back the scenes acquired in the last ten days', async () => {
            await givenScene({id: 'settled', acquisitionDate: '2021-09-15 00:00:00', dayOfYear: 258})
            await givenScene({id: 'too-recent', acquisitionDate: '2021-09-26 00:00:00', dayOfYear: 269})

            const found = await repository.findScenesInSceneArea(aQuery({
                fromDate: '2021-01-01', toDate: '2021-12-31', targetDayOfYear: 260
            }))

            expect(found.map(({id}) => id)).toEqual(['settled'])
        })

        describe('the season', () => {
            test('reports the scenes taken within a season inside one year', async () => {
                await givenScene({id: 'in-season', dayOfYear: 200})
                await givenScene({id: 'before-season', dayOfYear: 100})
                await givenScene({id: 'after-season', dayOfYear: 300})

                const found = await repository.findScenesInSceneArea(aQuery())

                expect(found.map(({id}) => id)).toEqual(['in-season'])
            })

            // A season running from November to February is two ranges, not one.
            test('reports the scenes on either side of the new year for a season that crosses it', async () => {
                await givenScene({id: 'november', dayOfYear: 310})
                await givenScene({id: 'january', dayOfYear: 20})
                await givenScene({id: 'midsummer', dayOfYear: 200})

                const found = await repository.findScenesInSceneArea(aQuery({
                    fromDate: '2018-11-01', toDate: '2021-02-28', targetDayOfYear: 350
                }))

                expect(found.map(({id}) => id).sort()).toEqual(['january', 'november'])
            })
        })

        describe('the ranking', () => {
            test('prefers the clearest scene when only cloud cover counts', async () => {
                await givenScene({id: 'cloudy', cloudCover: 90, dayOfYear: 196})
                await givenScene({id: 'clear', cloudCover: 10, dayOfYear: 196})
                await givenScene({id: 'hazy', cloudCover: 50, dayOfYear: 196})

                const found = await repository.findScenesInSceneArea(aQuery({targetDayOfYearWeight: 0}))

                expect(found.map(({id}) => id)).toEqual(['clear', 'hazy', 'cloudy'])
            })

            test('prefers the scene nearest the target date when only the date counts', async () => {
                await givenScene({id: 'far', cloudCover: 10, dayOfYear: 260})
                await givenScene({id: 'near', cloudCover: 90, dayOfYear: 196})

                const found = await repository.findScenesInSceneArea(aQuery({targetDayOfYearWeight: 1}))

                expect(found.map(({id}) => id)).toEqual(['near', 'far'])
            })

            // Half the weight on each: a scene 74 days off the target loses to one as clear as it is
            // taken on the target day, and still beats one nine times cloudier.
            test('trades cloud cover against distance from the target date', async () => {
                await givenScene({id: 'on-target', cloudCover: 10, dayOfYear: 196})
                await givenScene({id: 'off-target', cloudCover: 10, dayOfYear: 270})
                await givenScene({id: 'very-cloudy', cloudCover: 90, dayOfYear: 196})

                const found = await repository.findScenesInSceneArea(aQuery({targetDayOfYearWeight: 0.5}))

                expect(found.map(({id}) => id)).toEqual(['on-target', 'off-target', 'very-cloudy'])
            })

            test('breaks a tie in score by distance from the target date', async () => {
                await givenScene({id: 'nearer', cloudCover: 10, dayOfYear: 196})
                await givenScene({id: 'further', cloudCover: 10, dayOfYear: 270})

                const found = await repository.findScenesInSceneArea(aQuery({targetDayOfYearWeight: 0}))

                expect(found.map(({id}) => id)).toEqual(['nearer', 'further'])
            })

            // The distance is measured around the year, so a scene late in December is close to a target
            // early in January rather than nearly a year away.
            test('measures the distance to the target date around the year', async () => {
                await givenScene({id: 'late-december', dayOfYear: 360, cloudCover: 50})
                await givenScene({id: 'february', dayOfYear: 50, cloudCover: 50})

                const found = await repository.findScenesInSceneArea(aQuery({
                    fromDate: '2018-11-01', toDate: '2021-02-28', targetDayOfYear: 5,
                    targetDayOfYearWeight: 1
                }))

                expect(found.map(({id}) => id)).toEqual(['late-december', 'february'])
            })
        })
    })

    describe('findBestScenes', () => {
        test('reports the chosen scenes of each area it is given', async () => {
            await givenScene({id: 'first-clear', sceneAreaId: SCENE_AREA_ID, cloudCover: 5})
            await givenScene({id: 'first-cloudy', sceneAreaId: SCENE_AREA_ID, cloudCover: 80})
            await givenScene({id: 'second-clear', sceneAreaId: ANOTHER_SCENE_AREA_ID, cloudCover: 5})

            const byArea = await repository.findBestScenes(aBestScenesQuery())

            expect(Object.keys(byArea).sort()).toEqual([SCENE_AREA_ID, ANOTHER_SCENE_AREA_ID].sort())
            expect(byArea[SCENE_AREA_ID].map(({id}) => id)).toEqual(['first-clear'])
            expect(byArea[ANOTHER_SCENE_AREA_ID].map(({id}) => id)).toEqual(['second-clear'])
        })

        test('reports an area with no scenes as having none', async () => {
            const byArea = await repository.findBestScenes(aBestScenesQuery())

            expect(byArea).toEqual({[SCENE_AREA_ID]: [], [ANOTHER_SCENE_AREA_ID]: []})
        })

        // Scenes are accumulated until they are jointly likely to show the ground: one scene at 5%
        // cloud is already there, where it takes two at 30% (0.3 * 0.3 = 0.09).
        test('takes more cloudy scenes than clear ones to reach the cloud cover target', async () => {
            for (const index of [1, 2, 3, 4, 5]) {
                await givenScene({id: `clear-${index}`, cloudCover: 5, dayOfYear: 190 + index})
                await givenScene({
                    id: `cloudy-${index}`, sceneAreaId: ANOTHER_SCENE_AREA_ID, cloudCover: 30,
                    dayOfYear: 190 + index
                })
            }

            const byArea = await repository.findBestScenes(aBestScenesQuery({
                minScenes: 1, maxScenes: 5, cloudCoverTarget: 0.1
            }))

            expect(byArea[SCENE_AREA_ID]).toHaveLength(1)
            expect(byArea[ANOTHER_SCENE_AREA_ID]).toHaveLength(2)
        })
    })

    // The ingester owns this table: it bulk-loads a staging copy and swaps it in. Nothing here writes
    // scenes, so the fixtures do.
    const givenScene = async (over = {}) => {
        const scene = {
            id: 'SC001', metaDataSource: SOURCE, dataSet: 'LANDSAT_8', sceneAreaId: SCENE_AREA_ID,
            acquisitionDate: '2020-07-15 00:00:00', dayOfYear: 196, cloudCover: 10,
            sunAzimuth: 130.5, sunElevation: 55.25, ...over,
        }
        await testDb.query(
            `INSERT INTO scene_meta_data
                (id, meta_data_source, sensor_id, scene_area_id, acquisition_date, day_of_year,
                 cloud_cover, sun_azimuth, sun_elevation, update_time)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [scene.id, scene.metaDataSource, scene.dataSet, scene.sceneAreaId, scene.acquisitionDate,
                scene.dayOfYear, scene.cloudCover, scene.sunAzimuth, scene.sunElevation]
        )
    }

    // A season of June to September, over the years 2018 to 2021, targeting mid-July.
    const aQuery = (over = {}) => ({
        sceneAreaId: SCENE_AREA_ID,
        source: SOURCE,
        dataSets: ['LANDSAT_8', 'LANDSAT_9'],
        fromDate: '2018-06-01',
        toDate: '2021-09-30',
        targetDayOfYear: 196,
        targetDayOfYearWeight: 0.5,
        ...over,
    })

    const aBestScenesQuery = (over = {}) => ({
        ...aQuery(),
        sceneAreaIds: [SCENE_AREA_ID, ANOTHER_SCENE_AREA_ID],
        cloudCoverTarget: 0.1,
        minScenes: 1,
        maxScenes: 3,
        ...over,
    })

    const SOURCE = 'LANDSAT'
    const SCENE_AREA_ID = 'SA_042'
    const ANOTHER_SCENE_AREA_ID = 'SA_043'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
