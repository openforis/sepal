package integration.scene.s3landsat8

import org.openforis.sepal.scene.retrieval.provider.s3landsat8.RestfulS3LandsatClient
import org.openforis.sepal.scene.retrieval.provider.s3landsat8.SceneIndex
import spock.lang.Specification


class S3LandsatClientTest extends Specification {
    def client = new RestfulS3LandsatClient('http://landsat-pds.s3.amazonaws.com/')

    def 'Getting the index of an existing scene returns a list of the files part of the scene'() {
        when:
            def index = client.index('LC81390452014295LGN00')

        then:
            index.count() == 25
            def scene = index.entries.find { it.fileName == ('LC81390452014295LGN00_B1.TIF') }
            scene != null
            scene.url == 'http://landsat-pds.s3.amazonaws.com/L8/139/045/LC81390452014295LGN00/LC81390452014295LGN00_B1.TIF'
            scene.sizeInBytes == 48.7E6d
    }

    def 'Getting the index with a malformed scene id throws IllegalArgumentException'() {
        when:
            client.index('malformed')

        then:
            thrown(IllegalArgumentException)
    }


    def 'Getting the index of a non-existing scene returns null'() {
        expect:
            client.index('LC8999999000000000000') == null
    }

    def 'Can download an entry from the index'() {
        expect:
            client.download(new SceneIndex.Entry('',
                    'http://landsat-pds.s3.amazonaws.com/L8/139/045/LC81390452014295LGN00/LC81390452014295LGN00_MTL.txt', 123)) {
                it.text.contains('LC81390452014295LGN00')
            }
    }
}
