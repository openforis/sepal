package endtoend.dataprovider

import fake.SynchronousJobExecutor

import org.openforis.sepal.dataprovider.FileSystemSceneDownloadCoordinator
import org.openforis.sepal.dataprovider.FileSystemSceneRepository
import org.openforis.sepal.dataprovider.SceneReference
import org.openforis.sepal.dataprovider.s3landsat8.S3Landsat8SceneProvider
import org.openforis.sepal.dataprovider.s3landsat8.S3LandsatClient
import org.openforis.sepal.dataprovider.s3landsat8.SceneIndex

import spock.lang.Ignore
import spock.lang.Specification
import spock.util.concurrent.PollingConditions
import util.DirectoryStructure
import static org.openforis.sepal.dataprovider.DataSet.LANDSAT_8

class S3Landsat8SceneProviderTest extends SceneProviderTest {
    def provider = new S3Landsat8SceneProvider(
            new FakeS3LandsatClient(),
            new SynchronousJobExecutor(),
            new FileSystemSceneDownloadCoordinator(
                    new FileSystemSceneRepository(workingDir)
            )
    )
    
    def cleanup() {
        workingDir.deleteDir()
    }


    def 'Retrieving a scene downloads the files'() {
        when:
            provider.retrieve(requestId, [new SceneReference(sceneId, LANDSAT_8)])
        then:
                DirectoryStructure.matches(workingDir) {
                    "${requestId}" {
                        "${LANDSAT_8}" {
                            "$sceneId" {
                                '1.tif'()
                                '2.tif'()
                            }
                        }
                    }
                }
    }
    
    @Ignore
    def 'Retrieving a scene notifies about the different stages'() {
        when:
            provider.retrieve(requestId, [new SceneReference(sceneId, LANDSAT_8)])
        then:
            false
    }

    static class FakeS3LandsatClient implements S3LandsatClient {
        SceneIndex index(String sceneId) {
            return new SceneIndex([
                    new SceneIndex.Entry('1.tif', '/url/to/1.tif', 1d),
                    new SceneIndex.Entry('2.tif', '/url/to/2.tif', 2d)
            ])
        }

        def void download(SceneIndex.Entry entry, Closure callback) {
            callback(new ByteArrayInputStream(entry.url.bytes))
        }
    }

}
