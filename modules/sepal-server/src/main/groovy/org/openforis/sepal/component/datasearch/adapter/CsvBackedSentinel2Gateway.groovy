package org.openforis.sepal.component.datasearch.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.datasearch.api.DataSetMetadataGateway
import org.openforis.sepal.component.datasearch.api.SceneMetaData
import org.openforis.sepal.util.CsvReader
import org.openforis.sepal.util.GzCsvUriReader
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.text.SimpleDateFormat

import static org.openforis.sepal.component.datasearch.api.DataSet.SENTINEL2

class CsvBackedSentinel2Gateway implements DataSetMetadataGateway {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    public static final String CSV_FILE_NAME = 'sentinel2.csv'
    private final File workingDir
    private final CsvReader reader
    private final RESTClient aws = new RESTClient('http://sentinel-s2-l1c.s3.amazonaws.com/tiles/')

    CsvBackedSentinel2Gateway(File workingDir, CsvReader reader) {
        this.workingDir = workingDir
        this.reader = reader
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
            if (isSceneIncluded(data)) {
                def id = id(data)
                def awsPath = awsPath(id)
                def size = data.TOTAL_SIZE ? data.TOTAL_SIZE as long : 0
                def cloudCover = data.CLOUD_COVER.toDouble()
                def coverage = size ? size / (size - size * cloudCover / 100d) : cloudCover
                return new SceneMetaData(
                        id: id,
                        dataSet: SENTINEL2,
                        sceneAreaId: data.MGRS_TILE,
                        sensorId: sensor,
                        acquisitionDate: parseDate(data.SENSING_TIME),
                        cloudCover: data.CLOUD_COVER.toDouble(),
                        browseUrl: browseUrl(awsPath),
                        updateTime: parseDate(data.GENERATION_TIME),
                        sunAzimuth: 0,
                        sunElevation: 0,
                        coverage: coverage
                )
            }
        } catch (Exception e) {
            LOG.warn("Failed to parse scene data $data: $e.message")
        }
        return null
    }

    private String id(data) {
        String date1, date2, tile
        if (data.GRANULE_ID.length() == 62) {
            date1 = data.PRODUCT_ID.substring(47, 47 + 15)
            date2 = data.GRANULE_ID.substring(25, 25 + 15)
            tile = data.GRANULE_ID.substring(49, 49 + 6)
        } else {
            date1 = data.PRODUCT_ID.substring(11, 11 + 15)
            date2 = data.PRODUCT_ID.substring(45)
            tile = data.GRANULE_ID.substring(4, 4 + 6)
        }
        def id = "${date1}_${date2}_${tile}"
        return id
    }

    private boolean isSceneIncluded(data) {
        return true
    }

    private String awsPath(id) {
        def utmCode = id.substring(33, 35) as int
        def latitudeBand = id.substring(35, 36)
        def square = id.substring(36, 38)
        def year = id.substring(0, 4) as int
        def month = id.substring(4, 6) as int
        def day = id.substring(6, 8) as int
        return "$utmCode/$latitudeBand/$square/$year/$month/$day/0"
    }

    private URI browseUrl(awsPath) {
        def base = 'http://sentinel-s2-l1c.s3.amazonaws.com/tiles'
        return URI.create("$base/$awsPath/preview.jpg")
    }

    double coveragePercentage(awsPath) {
        def response = aws.get(path: "$awsPath/tileInfo.json")
        return response.data.dataCoveragePercentage as double
    }

    private Date parseDate(String s) {
        def dateFormat = new SimpleDateFormat('yyyy-MM-dd\'T\'HH:mm:ss.SSSSSS\'Z\'')
        dateFormat.timeZone = TimeZone.getTimeZone("GMT")
        dateFormat.parse(s)
    }

    static DataSetMetadataGateway create(File workingDir) {
        new CsvBackedSentinel2Gateway(
                workingDir,
                new GzCsvUriReader(
                        'https://storage.googleapis.com/gcp-public-data-sentinel-2/index.csv.gz',
                        workingDir,
                        "${CSV_FILE_NAME}.gz"
                )
        )
    }

    private static enum Sensor {
        SENTINEL2A
    }
}
