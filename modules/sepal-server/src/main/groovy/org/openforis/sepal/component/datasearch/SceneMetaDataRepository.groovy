package org.openforis.sepal.component.datasearch

import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionManager

interface SceneMetaDataRepository extends SceneMetaDataProvider {
    Date lastUpdate(MetaDataSource source)

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
                    scene.updateTime, id, source.name()]
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
                      update_time = ?
                WHERE id = ? AND meta_data_source = ?''', params)
        if (!rowsUpdated)
            sql.executeInsert('''
                    INSERT INTO scene_meta_data(
                        sensor_id, scene_area_id, acquisition_date, cloud_cover, sun_azimuth, sun_elevation, browse_url,
                        update_time, id, meta_data_source)
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', params)
    }

    List<SceneMetaData> findScenesInSceneArea(SceneQuery sceneQuery) {
        return sql.rows('''
                SELECT id, meta_data_source, sensor_id, scene_area_id, acquisition_date, cloud_cover, sun_azimuth,
                       sun_elevation, browse_url, update_time
                FROM scene_meta_data
                WHERE scene_area_id = ?
                AND acquisition_date >= ? AND acquisition_date <= ?
                ORDER BY cloud_cover, acquisition_date''',
                [sceneQuery.sceneAreaId, sceneQuery.fromDate, sceneQuery.toDate]).collect {
            new SceneMetaData(
                    id: it.id,
                    source: it.meta_data_source as MetaDataSource,
                    sceneAreaId: it.scene_area_id,
                    sensorId: it.sensor_id,
                    acquisitionDate: new Date(it.acquisition_date.time as long),
                    cloudCover: it.cloud_cover,
                    sunAzimuth: it.sun_azimuth,
                    sunElevation: it.sun_elevation,
                    browseUrl: URI.create(it.browse_url),
                    updateTime: new Date(it.update_time.time as long)
            )
        }
    }

    Date lastUpdate(MetaDataSource source) {
        return sql.firstRow('''
                SELECT MAX(update_time) last_update
                FROM scene_meta_data
                WHERE meta_data_source = ?''', [source.name()]).last_update ?: new Date(Long.MIN_VALUE)
    }

    private getSql() {
        connectionManager.sql
    }
}