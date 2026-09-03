import {createPool} from '#sepal/db/mysql'

import {SCHEMA} from './database.js'
import {dayOfYearIgnoringLeapDay, seasonDayOfYearConstraint} from './sceneSearch.js'

let _pool

const getPool = async () => {
    if (!_pool) {
        _pool = await createPool(SCHEMA)
    }
    return _pool
}

const latestAcquisitionDate = () => {
    const d = new Date()
    d.setDate(d.getDate() - 10)
    return d
}

const placeholders = items => items.map(() => '?').join(', ')

const buildScoredQuery = query => {
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
        latestAcquisitionDate(),
        seasonStartDoy,
        seasonEndDoy,
        ...dataSets,
    ]

    return {sql, params}
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

const selectBest = (scoredRows, {minScenes, maxScenes, cloudCoverTarget}) => {
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

const findScenesInSceneArea = async query => {
    const pool = await getPool()
    const {sql, params} = buildScoredQuery(query)
    const [rows] = await pool.query(sql, params)
    return rows.map(toSceneMetaData)
}

const findBestScenes = async query => {
    const {sceneAreaIds, cloudCoverTarget, minScenes, maxScenes} = query
    const result = {}
    for (const sceneAreaId of sceneAreaIds) {
        const areaQuery = {...query, sceneAreaId}
        const rows = await findScenesInSceneArea(areaQuery)
        result[sceneAreaId] = selectBest(rows, {minScenes, maxScenes, cloudCoverTarget})
    }
    return result
}

export {findBestScenes, findScenesInSceneArea, selectBest}
