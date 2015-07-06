package unit

import spock.lang.Ignore
import spock.lang.Specification

@Ignore
class GeoServerTest extends Specification {
//    def geoServer = new RestGeoServer('http://168.202.56.107:8080/geoserver/', 'admin', 'geoserver')

    def 'Test create workspace'() {
        expect:
            geoServer.addWorkspace('Test_User')
    }

    def 'Test publish layer'() {
        geoServer.addWorkspace('Test_User')

        expect:
            geoServer.publishLayer('Test_User', new File('/shared/Landsat/mosaic'))
    }
}
