package integration.datasearch

import org.openforis.sepal.component.datasearch.SceneMetaData
import org.openforis.sepal.component.datasearch.usgs.CsvBackedUsgsGateway
import org.openforis.sepal.util.CsvReader
import spock.lang.Specification

import static org.openforis.sepal.component.datasearch.usgs.LandsatSensor.LANDSAT_8
import static org.openforis.sepal.util.DateTime.toDateString

class CsvBackedUsgsGatewayTest extends Specification {
    def workingDir = File.createTempDir()

    def cleanup() {
        workingDir.deleteDir()
    }

    def 'Uninitialized and no csv sources, when iterating, no scenes are returned'() {
        def gateway = new CsvBackedUsgsGateway(workingDir, [:], [:])
        def updates = []

        when:
        gateway.eachSceneUpdatedSince([:]) {
            updates << it
        }
        then:
        updates.empty
    }

    def 'Uninitialized and init source, when iterating, scenes are returned'() {
        def gateway = new CsvBackedUsgsGateway(workingDir, [(LANDSAT_8): [new FakeCsvReader(a: new Date())]], [:])

        when:
        def updates = iterate(gateway, [:])

        then:
        updates.size() == 1
        def scenes = updates.first()
        scenes.size() == 1
        scenes.first().id == 'a'
    }

    def 'Uninitialized and sources, when iterating, only init sources are used'() {
        def gateway = new CsvBackedUsgsGateway(workingDir,
                [(LANDSAT_8): [new FakeCsvReader(a: new Date())]],
                [(LANDSAT_8): [new FakeCsvReader(b: new Date())]])

        when:
        def updates = iterate(gateway, [:])

        then:
        updates.size() == 1
        def scenes = updates.first()
        scenes.size() == 1
        scenes.first().id == 'a'
    }

    def 'Initialized and last update same as acquisition date, when iterating, scene is returned'() {
        initAll()
        def acquisitionDate = new Date()
        def gateway = new CsvBackedUsgsGateway(workingDir,
                [:],
                [(LANDSAT_8): [new FakeCsvReader(a: acquisitionDate)]])

        when:
        def updates = iterate(gateway, [(LANDSAT_8): acquisitionDate])

        then:
        updates.size() == 1
        def scenes = updates.first()
        scenes.size() == 1
        scenes.first().id == 'a'
    }

    def 'Initialized and last update between acquisition dates, when iterating, scene with new date is returned'() {
        initAll()
        def lastUpdated = new Date() - 10
        def gateway = new CsvBackedUsgsGateway(workingDir,
                [:],
                [(LANDSAT_8): [new FakeCsvReader(
                        a: lastUpdated + 1,
                        b: lastUpdated - 1,
                )]])

        when:
        def updates = iterate(gateway, [(LANDSAT_8): lastUpdated])

        then:
        updates.size() == 1
        def scenes = updates.first()
        scenes.size() == 1
        scenes.first().id == 'a'
    }

    def 'Given successfully iterated unititialized, when iterating, initialized sources are used'() {
        def gateway = new CsvBackedUsgsGateway(workingDir,
                [(LANDSAT_8): [new FakeCsvReader(a: new Date())]],
                [(LANDSAT_8): [new FakeCsvReader(b: new Date())]])

        iterate(gateway, [:])

        when:
        def updates = iterate(gateway, [(LANDSAT_8): new Date() - 10])

        then:
        updates.size() == 1
        def scenes = updates.first()
        scenes.size() == 1
        scenes.first().id == 'b'
    }

    private List<List<SceneMetaData>> iterate(CsvBackedUsgsGateway gateway, Map lastUpdateBySensor) {
        def updates = []
        gateway.eachSceneUpdatedSince(lastUpdateBySensor) {
            updates << it
        }
        return updates
    }

    private initAll() {
        new CsvBackedUsgsGateway(workingDir, [:], [:]).eachSceneUpdatedSince([:]) {}
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
                    sceneID        : id,
                    path           : '123',
                    row            : '123',
                    acquisitionDate: toDateString(acquisitionDate),
                    cloudCoverFull : 1.2,
                    sunAzimuth     : 100.2,
                    sunElevation   : 40.2,
                    browseURL      : 'http://browse.url',
                    dateUpdated    : toDateString(acquisitionDate),
                    DATA_TYPE_L1   : 'L1T',
                    dayOrNight     : 'DAY'
            ]
        }
    }
}
