package endtoend.dataprovider

import fake.SynchronousJobExecutor
import org.openforis.sepal.component.dataprovider.DownloadRequest
import org.openforis.sepal.component.dataprovider.SceneReference
import org.openforis.sepal.component.dataprovider.SceneRequest
import org.openforis.sepal.component.dataprovider.Status
import org.openforis.sepal.component.dataprovider.retrieval.FileSystemSceneRepository
import org.openforis.sepal.component.dataprovider.retrieval.provider.FileSystemSceneContextProvider
import org.openforis.sepal.component.dataprovider.retrieval.provider.s3landsat8.S3Landsat8SceneProvider
import org.openforis.sepal.component.dataprovider.retrieval.provider.s3landsat8.S3LandsatClient
import org.openforis.sepal.component.dataprovider.retrieval.provider.s3landsat8.SceneIndex
import spock.lang.Specification
import util.DirectoryStructure

import static org.openforis.sepal.component.dataprovider.DataSet.LANDSAT_8

class S3Landsat8SceneProviderTest extends Specification {
    def workingDir = File.createTempDir('workingDir', null)
    def requestId = 1L
    def sceneId = 'id'
    def provider = new S3Landsat8SceneProvider(
            new FakeS3LandsatClient(),
            new SynchronousJobExecutor(),
            new FileSystemSceneContextProvider(
                    new FileSystemSceneRepository(workingDir, null)
            )
    )

    def cleanup() {
        workingDir.deleteDir()
    }

    def 'Retrieving a scene downloads the files'() {
        def request = new SceneRequest(requestId, new SceneReference(sceneId, LANDSAT_8), 'Test.User', new Date(), Status.REQUESTED, new DownloadRequest(dataSet: LANDSAT_8, requestId: 1L, status: Status.REQUESTED))
        request.request.scenes.add(request)
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
