package org.openforis.sepal.component.datasearch.adapter

import groovy.json.JsonSlurper
import org.openforis.sepal.component.datasearch.api.DataSetMetadataGateway
import org.openforis.sepal.component.datasearch.api.SceneMetaData
import org.openforis.sepal.util.CsvReader
import org.openforis.sepal.util.CsvUriReader
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.text.SimpleDateFormat

import static org.openforis.sepal.component.datasearch.api.DataSet.SENTINEL2

class CsvBackedSentinel2Gateway implements DataSetMetadataGateway {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final File workingDir
    private final List<CsvReader> readers

    CsvBackedSentinel2Gateway(File workingDir, List<CsvReader> readers) {
        this.workingDir = workingDir
        this.readers = readers
    }

    void eachSceneUpdatedSince(
            Map<String, Date> lastUpdateBySensor,
            Closure callback
    ) throws DataSetMetadataGateway.SceneMetaDataRetrievalFailed {
        Sensor.values().each { sensor ->
            updatedSince(sensor, lastUpdateBySensor[sensor.name()], callback)
        }
    }

    private void updatedSince(sensor, lastUpdate, Closure callback) {
        def scenes = []
        readers.each { reader ->
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
        }
        if (scenes) {
            LOG.info("Initializing scene meta-data: Providing last ${scenes.size()} scenes from $sensor")
            callback.call(scenes)
        }
    }

    private SceneMetaData toSceneMetaData(sensor, data) {
        try {
            if (isSceneIncluded(data)) {
                def id = data['system:index'] as String
                id = id.substring(id.indexOf('_') + 1)
                return new SceneMetaData(
                        id: id,
                        dataSet: SENTINEL2,
                        sceneAreaId: id.substring(33),
                        sensorId: sensor,
                        acquisitionDate: parseDate(id.substring(0, 15)),
                        cloudCover: data.CLOUDY_PIXEL_PERCENTAGE.toDouble(),
                        coverage: data.DATA_COVERAGE_PERCENTAGE.toDouble(),
                        footprint: footprint(data),
                        browseUrl: browseUrl(id),
                        updateTime: parseDate(id.substring(16, 31))
                )
            }
        } catch (Exception e) {
            LOG.warn("Failed to parse scene data $data: $e.message")
        }
        return null
    }

    private List<List<BigDecimal>> footprint(data) {
        def json = new JsonSlurper().parseText(data['.geo'])
        return json.coordinates[0]
    }

    private boolean isSceneIncluded(data) {
        return true
    }

    private URI browseUrl(id) {
        def utmCode = id.substring(33, 35) as int
        def latitudeBand = id.substring(35, 36)
        def square = id.substring(36, 38)
        def year = id.substring(0, 4) as int
        def month = id.substring(4, 6) as int
        def day = id.substring(6, 8) as int
        def awsPath = "$utmCode/$latitudeBand/$square/$year/$month/$day/0"
        def base = 'http://sentinel-s2-l1c.s3.amazonaws.com/tiles'
        return URI.create("$base/$awsPath/preview.jpg")
    }

    static DataSetMetadataGateway create(File workingDir) {
        new CsvBackedSentinel2Gateway(
                workingDir,
                [
                        new CsvUriReader('https://dl.dropboxusercontent.com/s/nwzsxrhisr5dj9z/sentinel2-20150101-20160101.csv'),
                        new CsvUriReader('https://dl.dropboxusercontent.com/s/ca0rfbe7e0l9k0v/sentinel2-20160101-20160701.csv'),
                        new CsvUriReader('https://dl.dropboxusercontent.com/s/lh5bxt14e2oohlp/sentinel2-20160701-20170101.csv'),
                        new CsvUriReader('https://dl.dropboxusercontent.com/s/agsbw86jpmrkq39/sentinel2-20170101-20170701.csv'),
                ]
        )
    }

    private Date parseDate(String s) {
        def dateFormat = new SimpleDateFormat('yyyyMMdd\'T\'HHmmss')
        dateFormat.timeZone = TimeZone.getTimeZone("GMT")
        dateFormat.parse(s)
    }

    private static enum Sensor {
        SENTINEL2A
    }
}
