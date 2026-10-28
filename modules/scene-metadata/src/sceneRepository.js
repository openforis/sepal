import {dayOfYearIgnoringLeapDay, seasonDayOfYearConstraint} from './sceneSearch.js'

export class SceneRepository {
    #db
    #clock

    constructor(db, clock) {
        this.#db = db
        this.#clock = clock
    }

    findScenesInSceneArea(query) {
        return this.#db.withConnection(async connection => {
            const {sql, params} = buildScoredQuery(query, this.#clock())
            const [rows] = await connection.query(sql, params)
            return rows.map(toSceneMetaData)
        })
    }

    async findBestScenes(query) {
        const {sceneAreaIds, cloudCoverTarget, minScenes, maxScenes} = query
        const result = {}
        for (const sceneAreaId of sceneAreaIds) {
            const areaQuery = {...query, sceneAreaId}
            const rows = await this.findScenesInSceneArea(areaQuery)
            result[sceneAreaId] = selectBest(rows, {minScenes, maxScenes, cloudCoverTarget})
        }
        return result
    }
}

export const selectBest = (scoredRows, {minScenes, maxScenes, cloudCoverTarget}) => {
    const scenes = []
    let cumulative = 1
    for (const row of scoredRows) {
        scenes.push(row)
        cumulative *= row.cloud_cover / 100
        if (maxScenes <= scenes.length) break
        if (!(cumulative > cloudCoverTarget || scenes.length < minScenes)) break
    }
    return scenes
}

const buildScoredQuery = (query, now) => {
    const {
        sceneAreaId,
        dataSets,
        fromDate,
        toDate,
        targetDayOfYear: t,
        targetDayOfYearWeight: w,
    } = query

    const seasonStartDoy = dayOfYearIgnoringLeapDay(fromDate)
    const seasonEndDoy = dayOfYearIgnoringLeapDay(toDate)
    const {wrap} = seasonDayOfYearConstraint(seasonStartDoy, seasonEndDoy)

    const dayOfYearConstraint = wrap
        ? '(day_of_year >= ? OR day_of_year < ?)'
        : '(day_of_year >= ? AND day_of_year < ?)'

    const sql = `
        SELECT id, meta_data_source, sensor_id, scene_area_id, acquisition_date, cloud_cover,
               sun_azimuth, sun_elevation, update_time,
               (1.0 - ?) * cloud_cover / 100.0 + ? * LEAST(ABS(day_of_year - ?), 365.0 - ABS(day_of_year - ?)) / 182.0 AS sort_weight,
               LEAST(ABS(day_of_year - ?), 365.0 - ABS(day_of_year - ?)) AS days_from_target_date
        FROM scene_meta_data
        WHERE scene_area_id = ?
          AND acquisition_date >= ? AND acquisition_date <= ? AND acquisition_date <= ?
          AND ${dayOfYearConstraint}
          AND sensor_id IN (${placeholders(dataSets)})
        ORDER BY sort_weight, cloud_cover, days_from_target_date`

    const params = [
        w, w, t, t, t, t,
        sceneAreaId,
        fromDate,
        toDate,
        latestAcquisitionDate(now),
        seasonStartDoy,
        seasonEndDoy,
        ...dataSets,
    ]

    return {sql, params}
}

const placeholders = items => items.map(() => '?').join(', ')

const latestAcquisitionDate = now => {
    const d = new Date(now)
    d.setDate(d.getDate() - 10)
    return d
}

// Keeps the raw cloud_cover on the object so selectBest can use it.

const toSceneMetaData = row => ({
    id: row.id,
    source: row.meta_data_source,
    sceneAreaId: row.scene_area_id,
    dataSet: row.sensor_id,
    acquisitionDate: row.acquisition_date,
    cloudCover: row.cloud_cover,
    sunAzimuth: row.sun_azimuth,
    sunElevation: row.sun_elevation,
    updateTime: row.update_time,
    cloud_cover: row.cloud_cover,
})
