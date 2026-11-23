import {dayOfYearIgnoringLeapDay, seasonDayOfYearConstraint} from './sceneSearch.js'

export class SceneRepository {
    #db
    #clock

    constructor(db, clock) {
        this.#db = db
        this.#clock = clock
    }

    findScenesInSceneArea(query) {
        return this.#findScoredScenes(query)
    }

    async findBestScenes(query) {
        const {sceneAreaIds, cloudCoverTarget, minScenes, maxScenes} = query
        const result = {}
        for (const sceneAreaId of sceneAreaIds) {
            const areaQuery = {...query, sceneAreaId}
            const rows = await this.#findScoredScenes(areaQuery, maxScenes)
            result[sceneAreaId] = selectBest(rows, {minScenes, maxScenes, cloudCoverTarget})
        }
        return result
    }

    #findScoredScenes(query, limit) {
        return this.#db.withConnection(async connection => {
            const {sql, params} = buildScoredQuery(query, this.#clock(), limit)
            const {rows} = await connection.query(sql, params)
            return rows.map(toSceneMetaData)
        })
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

const buildScoredQuery = (query, now, limit) => {
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
        ? '(day_of_year >= $7 OR day_of_year < $8)'
        : '(day_of_year >= $7 AND day_of_year < $8)'

    const daysFromTarget = 'least(abs(day_of_year - $2::float8), 365 - abs(day_of_year - $2::float8))'

    const sql = `
        SELECT id, meta_data_source, sensor_id, scene_area_id, acquisition_date, cloud_cover,
               sun_azimuth, sun_elevation, update_time,
               (1 - $1::float8) * cloud_cover / 100 + $1::float8 * ${daysFromTarget} / 182 AS sort_weight,
               ${daysFromTarget} AS days_from_target_date
        FROM scene
        WHERE scene_area_id = $3
          AND acquisition_date >= $4 AND acquisition_date <= $5 AND acquisition_date <= $6
          AND ${dayOfYearConstraint}
          AND sensor_id = ANY($9::text[])
        ORDER BY sort_weight, cloud_cover, days_from_target_date
        ${limit === undefined ? '' : 'LIMIT $10'}`

    const params = [
        w,
        t,
        sceneAreaId,
        fromDate,
        toDate,
        latestAcquisitionDate(now),
        seasonStartDoy,
        seasonEndDoy,
        dataSets,
        ...(limit === undefined ? [] : [limit]),
    ]

    return {sql, params}
}

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
