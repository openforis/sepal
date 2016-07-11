package org.openforis.sepal.component.datasearch

import groovy.sql.Sql
import org.openforis.sepal.component.datasearch.api.SceneQuery
import org.openforis.sepal.component.datasearch.usgs.LandsatSensor
import org.openforis.sepal.transaction.SqlConnectionManager

import java.sql.Connection

interface SceneMetaDataRepository extends SceneMetaDataProvider {
    Map<LandsatSensor, Date> lastUpdateBySensor(MetaDataSource source)

    void updateAll(Collection<SceneMetaData> scenes)
}

class JdbcSceneMetaDataRepository implements SceneMetaDataRepository {
    private final SqlConnectionManager connectionManager

    JdbcSceneMetaDataRepository(SqlConnectionManager connectionManager) {
        this.connectionManager = connectionManager
    }

    void updateAll(Collection<SceneMetaData> scenes) {
        def sql = new Sql(connectionManager.dataSource)
        sql.withTransaction {
            scenes.each {
                update(it, sql)
            }
        }
    }

    private void update(SceneMetaData scene, Sql sql) {
        def params = scene.with {
            [sensorId, sceneAreaId, acquisitionDate, cloudCover, sunAzimuth, sunElevation, browseUrl.toString(),
             scene.updateTime, source.name(), id]
        }

        def rowsUpdated = sql.executeUpdate('''
                UPDATE scene_meta_data
                SET   sensor_id = ?,
                      scene_area_id = ?,
                      acquisition_date = ?,
                      cloud_cover = ?,
                      sun_azimuth = ?,
                      sun_elevation = ?,
                      browse_url = ?,
                      update_time = ?,
                      meta_data_source = ?
                WHERE id = ?''', params)
        if (!rowsUpdated)
            sql.executeInsert('''
                    INSERT INTO scene_meta_data(
                        sensor_id, scene_area_id, acquisition_date, cloud_cover, sun_azimuth, sun_elevation, browse_url,
                        update_time, meta_data_source, id)
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', params)
    }

    List<SceneMetaData> findScenesInSceneArea(SceneQuery query) {
        return sql.rows('''
                SELECT id, meta_data_source, sensor_id, scene_area_id, acquisition_date, cloud_cover, sun_azimuth,
                       sun_elevation, browse_url, update_time
                FROM scene_meta_data
                WHERE scene_area_id = ?
                AND acquisition_date >= ? AND acquisition_date <= ? AND acquisition_date <= ?''',
                [query.sceneAreaId, query.fromDate, query.toDate, latestAcquisitionDate()])
                .collect { toSceneMetaData(it) }
    }

    void eachScene(SceneQuery query, double cloudTargetDaySortWeight, Closure<Boolean> callback) {
        def q = """
                SELECT
                    (1 - $cloudTargetDaySortWeight) * cloud_cover / 100 + $cloudTargetDaySortWeight *
                    LEAST(
                        ABS(TIMESTAMPDIFF(DAY, acquisition_date, STR_TO_DATE(CONCAT(YEAR(acquisition_date) + 1, '-$query.targetDay'), '%Y-%m-%d'))),
                        ABS(TIMESTAMPDIFF(DAY, acquisition_date, STR_TO_DATE(CONCAT(YEAR(acquisition_date), '-$query.targetDay'), '%Y-%m-%d'))),
                        ABS(TIMESTAMPDIFF(DAY, acquisition_date, STR_TO_DATE(CONCAT(YEAR(acquisition_date) - 1, '-$query.targetDay'), '%Y-%m-%d')))) / 182 as sort_weight,
                    LEAST(
                        ABS(TIMESTAMPDIFF(DAY, acquisition_date, STR_TO_DATE(CONCAT(YEAR(acquisition_date) + 1, '-$query.targetDay'), '%Y-%m-%d'))),
                        ABS(TIMESTAMPDIFF(DAY, acquisition_date, STR_TO_DATE(CONCAT(YEAR(acquisition_date), '-$query.targetDay'), '%Y-%m-%d'))),
                        ABS(TIMESTAMPDIFF(DAY, acquisition_date, STR_TO_DATE(CONCAT(YEAR(acquisition_date) - 1, '-$query.targetDay'), '%Y-%m-%d')))) days_from_target_date,
                    id, meta_data_source, sensor_id, scene_area_id, acquisition_date, cloud_cover, sun_azimuth,
                    sun_elevation, browse_url, update_time
                FROM scene_meta_data
                WHERE scene_area_id  = ?
                AND sensor_id in (${placeholders(query.sensorIds)})
                AND acquisition_date >= ? AND acquisition_date <= ? AND acquisition_date <= ?
                ORDER BY sort_weight, cloud_cover, days_from_target_date""" as String


        sql.withTransaction { Connection conn ->
            def ps = conn.prepareStatement(q)
            def i = 0
            ps.setString(++i, query.sceneAreaId)
            query.sensorIds.each {
                ps.setString(++i, it)
            }
            ps.setDate(++i, new java.sql.Date(query.fromDate.time))
            ps.setDate(++i, new java.sql.Date(query.toDate.time))
            ps.setDate(++i, new java.sql.Date(latestAcquisitionDate().time))
            def rs = ps.executeQuery()
            while (rs.next()) {
                def scene = new SceneMetaData(
                        id: rs.getString('id'),
                        source: rs.getString('meta_data_source') as MetaDataSource,
                        sceneAreaId: rs.getString('scene_area_id'),
                        sensorId: rs.getString('sensor_id'),
                        acquisitionDate: new Date(rs.getTimestamp('acquisition_date').time as long),
                        cloudCover: rs.getDouble('cloud_cover'),
                        sunAzimuth: rs.getDouble('sun_azimuth'),
                        sunElevation: rs.getDouble('sun_elevation'),
                        browseUrl: URI.create(rs.getString('browse_url')),
                        updateTime: new Date(rs.getTimestamp('update_time').time as long)
                )
                if (!callback.call(scene))
                    break
            }
            rs.close()
            ps.close()
        }
    }

    Map<LandsatSensor, Date> lastUpdateBySensor(MetaDataSource source) {
        def lastUpdates = [:]
        sql.rows('''
                SELECT sensor_id, MAX(update_time) last_update
                FROM scene_meta_data
                WHERE meta_data_source = ?
                GROUP BY sensor_id''', [source.name()]).each {
            lastUpdates[it.sensor_id as LandsatSensor] = new Date(it.last_update.time as long)
        }
        return lastUpdates
    }

    private SceneMetaData toSceneMetaData(Map row) {
        new SceneMetaData(
                id: row.id,
                source: row.meta_data_source as MetaDataSource,
                sceneAreaId: row.scene_area_id,
                sensorId: row.sensor_id,
                acquisitionDate: new Date(row.acquisition_date.time as long),
                cloudCover: row.cloud_cover,
                sunAzimuth: row.sun_azimuth,
                sunElevation: row.sun_elevation,
                browseUrl: URI.create(row.browse_url),
                updateTime: new Date(row.update_time.time as long)
        )
    }

    private placeholders(Collection c) {
        (['?'] * c.size()).join(', ')
    }

    private getSql() {
        connectionManager.sql
    }

    /**
     * To make sure the actual data provider have the imagery, don't include results with images newer than this date.
     */
    private Date latestAcquisitionDate() {
        new Date() - 10
    }
}