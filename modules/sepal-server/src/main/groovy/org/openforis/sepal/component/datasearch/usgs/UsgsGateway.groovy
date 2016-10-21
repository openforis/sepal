package org.openforis.sepal.component.datasearch.usgs

import org.openforis.sepal.component.datasearch.SceneMetaData
import org.openforis.sepal.util.CsvReader
import org.openforis.sepal.util.CsvUriReader
import org.openforis.sepal.util.GzCsvUriReader
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.datasearch.MetaDataSource.USGS
import static org.openforis.sepal.component.datasearch.usgs.LandsatSensor.*
import static org.openforis.sepal.util.DateTime.parseDateString
import static org.openforis.sepal.util.DateTime.startOfDay

interface UsgsGateway {
    /**
     * Invokes callback for scenes updated since provided date.
     *
     * @param date scene updated before this date will not be included
     * @param callback invoked with list of SceneMetaData instances
     */
    void eachSceneUpdatedSince(Map<LandsatSensor, Date> lastUpdateBySensor, Closure callback) throws SceneMetaDataRetrievalFailed

    static class SceneMetaDataRetrievalFailed extends RuntimeException {
        SceneMetaDataRetrievalFailed(String message) {
            super(message)
        }
    }
}


class CsvBackedUsgsGateway implements UsgsGateway {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final File workingDir
    private final Map<LandsatSensor, List<CsvReader>> initCsvSourcesBySensor
    private final Map<LandsatSensor, List<CsvReader>> updateCsvSourcesBySensor

    CsvBackedUsgsGateway(
            File workingDir,
            Map<LandsatSensor, List<CsvReader>> initCsvSourcesBySensor,
            Map<LandsatSensor, List<CsvReader>> updateCsvSourcesBySensor) {
        this.workingDir = workingDir
        this.initCsvSourcesBySensor = initCsvSourcesBySensor
        this.updateCsvSourcesBySensor = updateCsvSourcesBySensor
    }

    @SuppressWarnings("UnnecessaryQualifiedReference")
    void eachSceneUpdatedSince(Map<LandsatSensor, Date> lastUpdateBySensor, Closure callback) throws UsgsGateway.SceneMetaDataRetrievalFailed {
        LandsatSensor.values().each { sensor ->
            if (sensorInitializedFile(sensor).exists())
                updatedSince(sensor, lastUpdateBySensor[sensor], callback)
            else
                initializeSensor(sensor, callback)
        }
    }

    private void initializeSensor(LandsatSensor sensor, Closure callback) {
        def scenes = []
        initCsvSourcesBySensor[sensor]?.each { reader ->
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

    private File sensorInitializedFile(LandsatSensor sensor) {
        new File(workingDir, "${sensor}.initialized")
    }

    private void updatedSince(LandsatSensor sensor, Date lastUpdate, Closure callback) {
        if (!lastUpdate)
            return
        lastUpdate = startOfDay(lastUpdate)
        updateCsvSourcesBySensor[sensor].each { readers ->
            def scenes = []
            readers.each { reader ->
                reader.eachLine {
                    def scene = toSceneMetaData(sensor, it)
                    if (scene && scene.acquisitionDate < lastUpdate)
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

    private SceneMetaData toSceneMetaData(LandsatSensor sensor, data) {
        try {
            // TODO: Get rid of 'LM5'
            if (isSceneIncluded(data))
                return new SceneMetaData(
                        id: data.sceneID,
                        source: USGS,
                        sceneAreaId: "${data.path}_${data.row}",
                        sensorId: sensor.name(),
                        acquisitionDate: parseDateString(data.acquisitionDate),
                        cloudCover: data.cloudCoverFull.toDouble(),
                        sunAzimuth: data.sunAzimuth.toDouble(),
                        sunElevation: data.sunElevation.toDouble(),
                        browseUrl: URI.create(data.browseURL),
                        updateTime: parseDateString(data.dateUpdated)
                )
        } catch (Exception ignore) {
        }
        return null
    }

    private boolean isSceneIncluded(data) {
        def prefix = (data.sceneID as String).substring(0, 3)
        return data.DATA_TYPE_L1 == 'L1T' &&
                data.dayOrNight == 'DAY' &&
                data.cloudCoverFull.toDouble() >= 0d &&
                prefix in ['LM1', 'LM2', 'LM3', 'LM4', 'LT4', 'LM5', 'LT5', 'LE7', 'LC8', 'LT8']
    }

    static UsgsGateway create(File workingDir) {
        new CsvBackedUsgsGateway(workingDir, [
                (LANDSAT_8)          : [
                        new GzCsvUriReader(
                                'http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_8.csv.gz',
                                workingDir,
                                'LANDSAT_8')],
                (LANDSAT_ETM)        : [
                        new GzCsvUriReader(
                                'http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_ETM.csv.gz',
                                workingDir,
                                'LANDSAT_ETM')],
                (LANDSAT_ETM_SLC_OFF): [
                        new GzCsvUriReader(
                                'http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_ETM_SLC_OFF.csv.gz',
                                workingDir,
                                'LANDSAT_ETM_SLC_OFF')],
                (LANDSAT_TM)         : [
                        new GzCsvUriReader(
                                'http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_TM-1980-1989.csv.gz',
                                workingDir,
                                'LANDSAT_TM-1980-1989'),
                        new GzCsvUriReader(
                                'http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_TM-1990-1999.csv.gz',
                                workingDir,
                                'LANDSAT_TM-1990-1999'),
                        new GzCsvUriReader(
                                'http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_TM-2000-2009.csv.gz',
                                workingDir,
                                'LANDSAT_TM-2000-2009'),
                        new GzCsvUriReader(
                                'http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_TM-2010-2012.csv.gz',
                                workingDir,
                                'LANDSAT_TM-2010-2012')],
                (LANDSAT_MSS)        : [
                        new GzCsvUriReader(
                                'http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_MSS2.csv.gz',
                                workingDir,
                                'LANDSAT_MSS2'),
                        new GzCsvUriReader(
                                'http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_MSS1.csv.gz',
                                workingDir,
                                'LANDSAT_MSS1')]
        ], [
                (LANDSAT_8)          : [
                        new CsvUriReader('http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_8.csv')
                ],
                (LANDSAT_ETM)        : [
                        new CsvUriReader('http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_ETM.csv')
                ],
                (LANDSAT_ETM_SLC_OFF): [
                        new CsvUriReader('http://landsat.usgs.gov/metadata_service/bulk_metadata_files/LANDSAT_ETM_SLC_OFF.csv')
                ]
        ])
    }
}
