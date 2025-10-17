package org.openforis.sepal.component.datasearch.adapter

import org.openforis.sepal.component.datasearch.api.DataSetMetadataGateway
import org.openforis.sepal.component.datasearch.api.SceneMetaData
import org.openforis.sepal.util.CsvReader
import org.openforis.sepal.util.CsvUriReader
import org.openforis.sepal.util.GzCsvUriReader
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.text.SimpleDateFormat

import static org.openforis.sepal.component.datasearch.adapter.CsvBackedUsgsGateway.Sensor.*
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
            if (sensorInitializedFile(sensor).exists()) {
                updatedSince(sensor, lastUpdateBySensor[sensor.name()], callback)
            } else {
                initializeSensor(sensor, callback)
            }
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
                def dataSet = getDataSet(data)
                def metadata = new SceneMetaData(
                        id: data['Landsat Scene Identifier'],
                        source: 'LANDSAT',
                        sceneAreaId: "${data['WRS Path']}_${data['WRS Row']}",
                        dataSet: dataSet,
                        acquisitionDate: new SimpleDateFormat('yy/MM/dd').parse(data['Date Acquired'] as String),
                        cloudCover: cloudCover(sensor, data),
                        coverage: 100,
                        sunAzimuth: data['Sun Azimuth L0RA'] ? data['Sun Azimuth L0RA'].toDouble() : 0d,
                        sunElevation: data['Sun Elevation L0RA'] ? data['Sun Elevation L0RA'].toDouble() : 0d,
                        updateTime: new SimpleDateFormat('yy/MM/dd').parse(data['Date Product Generated L1'] as String)
                )
                return metadata
            }
        } catch (Exception e) {
            LOG.error("${e.message}: ${data}")
        }
        return null
    }

    private Double cloudCover(Sensor sensor, data) {
        def result = data['Scene Cloud Cover L1'].toDouble() as Double
        if (result && sensor == LANDSAT_7 && data['Scan Gap Interpolation'] != '-1')
            result = Math.min(100, result + 22)
        return result
    }

    private boolean isSceneIncluded(data) {
        data['Collection Category'] in ['T1', 'T2'] &&
                data['Day/Night Indicator'].toUpperCase() == 'DAY' &&
                data['Scene Cloud Cover L1'].toDouble() >= 0d &&
                getPrefix(data) in ['LT4', 'LT5', 'LE7', 'LC8', 'LC9']
    }

    private String getPrefix(data) {
        (data['Landsat Scene Identifier'] as String).substring(0, 3)
    }

    static DataSetMetadataGateway create(File workingDir) {
        // From https://www.usgs.gov/landsat-missions/bulk-metadata-service
        new CsvBackedUsgsGateway(workingDir, [
                (LANDSAT_OT.name()) : [
                        new GzCsvUriReader(
                                'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_OT_C2_L1.csv.gz',
                                workingDir,
                                'LANDSAT_OT')],
                (LANDSAT_7.name()) : [
                        new GzCsvUriReader(
                                'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_ETM_C2_L1.csv.gz',
                                workingDir,
                                'LANDSAT_7')],
                (LANDSAT_TM.name()): [
                        new GzCsvUriReader(
                                'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_TM_C2_L1.csv.gz',
                                workingDir,
                                'LANDSAT_TM')]
        ], [
                (LANDSAT_OT.name()): [
                        new CsvUriReader('https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_OT_C2_L1.csv')
                ],
                (LANDSAT_7.name()): [
                        new CsvUriReader('https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_ETM_C2_L1.csv')
                ]
        ])
    }

    private String getDataSet(data) {
        def prefix = getPrefix(data)
        def dataSetBase = dataSetByPrefix[prefix]
        def dataSet = data['Collection Category'] == 'T2' ? dataSetBase + '_T2' : dataSetBase
    }

    private Map<String, String> dataSetByPrefix = [
       LT4: 'LANDSAT_TM', 
       LT5: 'LANDSAT_TM', 
       LE7: 'LANDSAT_7', 
       LC8: 'LANDSAT_8', 
       LC9: 'LANDSAT_9'
    ]
    
    static enum Sensor {
        LANDSAT_OT,
        LANDSAT_7,
        LANDSAT_TM
    }
}
