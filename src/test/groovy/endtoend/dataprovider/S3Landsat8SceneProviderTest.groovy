package endtoend.dataprovider

import fake.SynchronousJobExecutor
import org.openforis.sepal.sceneretrieval.provider.FileSystemSceneDownloadCoordinator
import org.openforis.sepal.sceneretrieval.provider.FileSystemSceneRepository
import org.openforis.sepal.sceneretrieval.provider.SceneReference
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.sceneretrieval.provider.s3landsat8.S3Landsat8SceneProvider
import org.openforis.sepal.sceneretrieval.provider.s3landsat8.S3LandsatClient
import org.openforis.sepal.sceneretrieval.provider.s3landsat8.SceneIndex
import util.DirectoryStructure

import static org.openforis.sepal.sceneretrieval.provider.DataSet.LANDSAT_8

class S3Landsat8SceneProviderTest extends SceneProviderTest {
    def provider = new S3Landsat8SceneProvider(
            new FakeS3LandsatClient(),
            new SynchronousJobExecutor(),
            new FileSystemSceneDownloadCoordinator(
                    new FileSystemSceneRepository(workingDir, null)
            )
    )

    def cleanup() {
        workingDir.deleteDir()
    }


    def 'Retrieving a scene downloads the files'() {
        def request = new SceneRequest(requestId, new SceneReference(sceneId, LANDSAT_8), 'Test.User')
        when:
            provider.retrieve([request])
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
