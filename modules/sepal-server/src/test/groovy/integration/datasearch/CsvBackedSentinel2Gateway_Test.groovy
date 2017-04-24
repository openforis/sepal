package integration.datasearch

import org.openforis.sepal.component.datasearch.api.SceneMetaData
import org.openforis.sepal.component.datasearch.adapter.CsvBackedSentinel2GatewayWithCoverageAndFootprint
import org.openforis.sepal.util.CsvReader
import org.openforis.sepal.util.CsvUriReader
import spock.lang.Ignore
import spock.lang.Specification

import java.text.SimpleDateFormat

@Ignore
class CsvBackedSentinel2Gateway_Test extends Specification {
    public static final Date LONG_AGO = new Date(0)
    def workingDir = File.createTempDir()
    def sceneId = '20150627T102531_20160606T223605_T31RCL'
    def sceneId2 = '20150627T102531_20160606T223605_T31RCM'

    def cleanup() {
        workingDir.deleteDir()
    }

//    @Ignore
    def 'Test'() {
        when:
//        def reader = new CsvInputStreamReader(new FileInputStream('/Users/wiell/Downloads/sentinel2-metadata.csv'))
//        def reader = new CsvUriReader('https://drive.google.com/open?id=0B1fRIaLaJSWtOU9HSzQ2Tml0eFk')
        def reader = new CsvUriReader('https://dl.dropboxusercontent.com/u/6262669/sentinel2-metadata.csv')
        def gateway = new CsvBackedSentinel2GatewayWithCoverageAndFootprint(workingDir, reader)

        def ids = [:]
        gateway.eachSceneUpdatedSince(SENTINEL2A: LONG_AGO) { scenes ->
            scenes.each { SceneMetaData scene ->
                def count = ids[scene.id]
                if (count)
                    count++
                else
                    count = 1
                ids[scene.id] = count
            }
        }

        def duplicate = ids.findAll { it.value > 1 }

        then:
        true
    }

    def 'Two scenes get accessed'() {
        def reader = new FakeCsvReader([(sceneId): now, (sceneId2): now])
        def gateway = new CsvBackedSentinel2GatewayWithCoverageAndFootprint(workingDir, reader)

        when:
        def updates = iterate(SENTINEL2A: LONG_AGO, gateway)

        then:
        updates.size() == 1
        def scenes = updates.first()
        scenes.size() == 2
    }

    def 'Scene acuired before last update is excluded'() {
        def reader = new FakeCsvReader((sceneId): LONG_AGO)
        def gateway = new CsvBackedSentinel2GatewayWithCoverageAndFootprint(workingDir, reader)

        expect:
        !iterate(SENTINEL2A: now, gateway)
    }

    private Date getNow() {
        new Date()
    }

    List<List<SceneMetaData>> iterate(Map lastUpdateBySensor, gateway) {
        def updates = []
        gateway.eachSceneUpdatedSince(lastUpdateBySensor) {
            updates << it
        }
        return updates
    }

    private static class FakeCsvReader implements CsvReader {
        private final Map<String, Date> acquisitionDateById

        FakeCsvReader(Map<String, Date> acquisitionDateById) {
            this.acquisitionDateById = acquisitionDateById
        }

        void eachLine(Closure callback) {
            acquisitionDateById.each { id, acquisitionDate ->
                callback.call(metaData(id, acquisitionDate))

            }
        }

        private Map metaData(String id, Date acquisitionDate) {
            [
                    GRANULE_ID            : id,
                    PRODUCT_ID            : 'S2A_MSIL1C_20161206T030112_N0204_R032_T48LYR_20161206T031336',
                    DATATAKE_IDENTIFIER   : 'GS2A_20161206T030112_007608_N02.04',
                    MGRS_TILE             : '48LYR',
                    SENSING_TIME          : formatDate(acquisitionDate),
                    TOTAL_SIZE            : '26990918',
                    CLOUD_COVER           : '0',
                    GEOMETRIC_QUALITY_FLAG: 'PASSED',
                    GENERATION_TIME       : formatDate(acquisitionDate),
                    NORTH_LAT             : '-8.236194716',
                    SOUTH_LAT             : '-8.236194716',
                    WEST_LON              : '107.1761913',
                    EAST_LON              : '107.5805142',
                    BASE_URL              : 'gs://gcp-public-data-sentinel-2/tiles/48/L/YR/S2A_MSIL1C_20161206T030112_N0204_R032_T48LYR_20161206T031336.SAFE'
            ]
        }

        private String formatDate(Date date) {
            new SimpleDateFormat('yyyy-MM-dd\'T\'HH:mm:ss.SSSSSS\'Z\'').format(date)
        }
    }
}
