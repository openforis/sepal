package org.openforis.sepal.component.datasearch.sentinel2

import org.openforis.sepal.component.datasearch.DataSetMetadataGateway
import org.openforis.sepal.component.datasearch.SceneMetaData
import org.openforis.sepal.util.CsvReader
import org.openforis.sepal.util.GzCsvUriReader
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.text.SimpleDateFormat

import static org.openforis.sepal.component.datasearch.MetaDataSource.SENTINEL2

class CsvBackedSentinel2Gateway implements DataSetMetadataGateway {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final CsvReader reader

    CsvBackedSentinel2Gateway(CsvReader reader) {
        this.reader = reader
    }

    void eachSceneUpdatedSince(
            Map<String, Date> lastUpdateBySensor,
            Closure callback
    ) throws DataSetMetadataGateway.SceneMetaDataRetrievalFailed {
        Sentinel2Sensor.values().each { sensor ->
            updatedSince(sensor, lastUpdateBySensor[sensor.name()], callback)
        }
    }

    private void updatedSince(sensor, lastUpdate, Closure callback) {
        def scenes = []
        reader.eachLine {
            def scene = toSceneMetaData(sensor, it)
            if (scene && lastUpdate && scene.acquisitionDate < lastUpdate)
                return true
            if (scene)
                scenes << scene
            if (scenes.size() >= 10000) {
                LOG.info("Initializing scene meta-data: Providing batch of ${scenes.size()} scenes from $sensor")
                callback.call(scenes)
                scenes.clear()
            }
        }
        if (scenes) {
            LOG.info("Initializing scene meta-data: Providing last ${scenes.size()} scenes from $sensor")
            callback.call(scenes)
        }
    }

    private SceneMetaData toSceneMetaData(sensor, data) {
        try {
            if (isSceneIncluded(data))
                return new SceneMetaData(
                        id: data.GRANULE_ID,
                        source: SENTINEL2,
                        sceneAreaId: data.MGRS_TILE,
                        sensorId: sensor,
                        acquisitionDate: parseDate(data.SENSING_TIME),
                        cloudCover: data.CLOUD_COVER.toDouble(),
                        browseUrl: browseUrl(data),
                        updateTime: parseDate(data.GENERATION_TIME),
                        sunAzimuth: 0,
                        sunElevation: 0
                )
        } catch (Exception e) {
            LOG.warn("Failed to parse scene data $data: $e.message")
        }
        return null
    }

    private boolean isSceneIncluded(data) {
        return true
    }

    private URI browseUrl(data) {
        return URI.create('http://foo.bar')
    }

    private Date parseDate(String s) {
        def dateFormat = new SimpleDateFormat('yyyy-MM-dd\'T\'HH:mm:ss.SSSSSS\'Z\'')
        dateFormat.timeZone = TimeZone.getTimeZone("GMT")
        dateFormat.parse(s)
    }

    static DataSetMetadataGateway create(File workingDir) {
        new CsvBackedSentinel2Gateway(
                new GzCsvUriReader(
                        'https://storage.googleapis.com/gcp-public-data-sentinel-2/index.csv.gz',
                        workingDir,
                        'sentinel2.csv.gz'
                )
        )
    }

}
