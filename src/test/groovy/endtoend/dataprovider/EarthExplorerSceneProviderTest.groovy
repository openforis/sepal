package endtoend.dataprovider



import org.openforis.sepal.scene.retrieval.provider.FileSystemSceneContextProvider
import org.openforis.sepal.scene.retrieval.FileSystemSceneRepository
import org.openforis.sepal.scene.SceneReference
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.EarthExplorerClient
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.EarthExplorerSceneProvider

import util.DirectoryStructure;
import fake.SynchronousJobExecutor
import static org.openforis.sepal.scene.DataSet.LANDSAT_8

class EarthExplorerSceneProviderTest extends SceneProviderTest{
    def provider = new EarthExplorerSceneProvider(
        new FakeEarthExplorerClient(),
    new SynchronousJobExecutor(),
    new FileSystemSceneContextProvider(
    new FileSystemSceneRepository(workingDir,null)
    )
    )


    def 'retrieve a scene and download/unzip the files'(){
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


    static class FakeEarthExplorerClient implements EarthExplorerClient{


        @Override
        void download(SceneRequest sceneRequest, String downloadLink, Closure callback) {
            callback(getClass().getResourceAsStream("/scene.tar.gz"),0d)
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
