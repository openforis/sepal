package org.openforis.sepal.component.datasearch.adapter

import org.openforis.sepal.component.datasearch.api.DataSetMetadataGateway
import org.openforis.sepal.component.datasearch.api.SceneMetaData
import org.openforis.sepal.util.CsvReader
import org.openforis.sepal.util.CsvUriReader
import org.openforis.sepal.util.GzCsvUriReader
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.datasearch.adapter.CsvBackedUsgsGateway.Sensor.*
import static org.openforis.sepal.component.datasearch.api.DataSet.LANDSAT
import static org.openforis.sepal.util.DateTime.parseDateString
import static org.openforis.sepal.util.DateTime.startOfDay

class CsvBackedUsgsGateway implements DataSetMetadataGateway {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final File workingDir
    private final Map<String, List<CsvReader>> initCsvSourcesBySensor
    private final Map<String, List<CsvReader>> updateCsvSourcesBySensor

    CsvBackedUsgsGateway(
            File workingDir,
            Map<String, List<CsvReader>> initCsvSourcesBySensor,
            Map<String, List<CsvReader>> updateCsvSourcesBySensor) {
        this.workingDir = workingDir
        this.initCsvSourcesBySensor = initCsvSourcesBySensor
        this.updateCsvSourcesBySensor = updateCsvSourcesBySensor
    }

    @SuppressWarnings("UnnecessaryQualifiedReference")
    void eachSceneUpdatedSince(Map<String, Date> lastUpdateBySensor, Closure callback)
            throws DataSetMetadataGateway.SceneMetaDataRetrievalFailed {
        Sensor.values().each { sensor ->
            if (sensorInitializedFile(sensor).exists())
                updatedSince(sensor, lastUpdateBySensor[sensor.name()], callback)
            else
                initializeSensor(sensor, callback)
        }
    }

    private void initializeSensor(Sensor sensor, Closure callback) {
        def scenes = []
        initCsvSourcesBySensor[sensor.name()]?.each { reader ->
            reader.eachLine {
                def scene = toSceneMetaData(sensor, it)
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

        sensorInitializedFile(sensor).createNewFile()
    }

    private File sensorInitializedFile(Sensor sensor) {
        new File(workingDir, "${sensor}.initialized")
    }

    private void updatedSince(Sensor sensor, Date lastUpdate, Closure callback) {
        if (!lastUpdate)
            return
        lastUpdate = startOfDay(lastUpdate)
        updateCsvSourcesBySensor[sensor.name()].each { readers ->
            def scenes = []
            readers.each { reader ->
                reader.eachLine {
                    def scene = toSceneMetaData(sensor, it)
                    if (scene && scene.updateTime < lastUpdate)
                        return false
                    if (scene)
                        scenes << scene
                }
            }
            if (scenes) {
                callback.call(scenes)
            }
        }
    }

    private SceneMetaData toSceneMetaData(Sensor sensor, data) {
        try {
            if (isSceneIncluded(data)) {
                def sensorId = data.COLLECTION_CATEGORY == 'T2' ? sensor.name() + '_T2' : sensor.name()
                return new SceneMetaData(
                        id: data.sceneID,
                        dataSet: LANDSAT,
                        sceneAreaId: "${data.path}_${data.row}",
                        sensorId: sensorId,
                        acquisitionDate: parseDateString(data.acquisitionDate),
                        cloudCover: cloudCover(sensor, data),
                        coverage: 100,
                        sunAzimuth: data.sunAzimuth.toDouble(),
                        sunElevation: data.sunElevation.toDouble(),
                        browseUrl: URI.create(data.browseURL),
                        updateTime: parseDateString(data.dateUpdated)
                )
            }
        } catch (Exception ignore) {
        }
        return null
    }

    private Double cloudCover(Sensor sensor, data) {
        def result = data.cloudCover.toDouble() as Double
        // LANDSAT_7 with SLC off always miss about 22% of its data. Consider that cloud cover.
        if (result && sensor == LANDSAT_7 && data.SCAN_GAP_INTERPOLATION != '-1')
            result = Math.min(100, result + 22)
        return result
    }

    private boolean isSceneIncluded(data) {
        def prefix = (data.sceneID as String).substring(0, 3)
        return data.COLLECTION_CATEGORY in ['T1', 'T2'] &&
                data.dayOrNight == 'DAY' &&
                data.cloudCover.toDouble() >= 0d &&
                prefix in ['LT4', 'LT5', 'LE7', 'LC8']
    }

    static DataSetMetadataGateway create(File workingDir) {
        // From https://landsat.usgs.gov/download-entire-collection-metadata
        new CsvBackedUsgsGateway(workingDir, [
                (LANDSAT_8.name()) : [
                        new GzCsvUriReader(
                                'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_8_C1.csv.gz',
                                workingDir,
                                'LANDSAT_8')],
                (LANDSAT_7.name()) : [
                        new GzCsvUriReader(
                                'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_ETM_C1.csv.gz',
                                workingDir,
                                'LANDSAT_7')],
                (LANDSAT_TM.name()): [
                        new GzCsvUriReader(
                                'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_TM_C1.csv.gz',
                                workingDir,
                                'LANDSAT_TM')]
        ], [
                (LANDSAT_8.name()): [
                        new CsvUriReader('https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_8_C1.csv')
                ],
                (LANDSAT_7.name()): [
                        new CsvUriReader('https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_ETM_C1.csv')
                ]
        ])
    }

    static enum Sensor {
        LANDSAT_8,
        LANDSAT_7,
        LANDSAT_TM
    }
}
