package endtoend.dataprovider

import fake.SynchronousJobExecutor
import org.openforis.sepal.scene.DownloadRequest
import org.openforis.sepal.scene.SceneReference
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.Status
import org.openforis.sepal.scene.retrieval.FileSystemSceneRepository
import org.openforis.sepal.scene.retrieval.provider.FileSystemSceneContextProvider
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.EarthExplorerClient
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.EarthExplorerSceneProvider
import spock.lang.Specification
import util.DirectoryStructure

import static org.openforis.sepal.scene.DataSet.LANDSAT_8

class EarthExplorerSceneProviderTest extends Specification {

    def workingDir = File.createTempDir('workingDir', null)
    def requestId = 1L
    def sceneId = 'id'

    def provider = new EarthExplorerSceneProvider(
            new FakeEarthExplorerClient(),
            new SynchronousJobExecutor(),
            new FileSystemSceneContextProvider(
                    new FileSystemSceneRepository(workingDir, null)
            )
    )


    def 'retrieve a scene and download/unzip the files'() {
        def request = new SceneRequest(requestId, new SceneReference(sceneId, LANDSAT_8), 'Test.User',new Date(),Status.REQUESTED, new DownloadRequest(requestId: 1L, status: Status.REQUESTED))
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


    static class FakeEarthExplorerClient implements EarthExplorerClient {


        @Override
        void download(SceneRequest sceneRequest, String downloadLink, Closure callback) {
            callback(getClass().getResourceAsStream("/scene.tar.gz"), 0d)
        }

        @Override
        double getSceneSize(String sceneUrl) {
            return 0d
        }

        @Override
        String lookupDownloadLink(SceneRequest sceneRequest) {
            return 'yes'
        }
    }
}
