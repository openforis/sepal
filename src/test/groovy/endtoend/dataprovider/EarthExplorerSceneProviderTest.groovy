package endtoend.dataprovider



import org.openforis.sepal.sceneretrieval.provider.FileSystemSceneDownloadCoordinator
import org.openforis.sepal.sceneretrieval.provider.FileSystemSceneRepository
import org.openforis.sepal.sceneretrieval.provider.SceneReference
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.sceneretrieval.provider.earthexplorer.EarthExplorerClient
import org.openforis.sepal.sceneretrieval.provider.earthexplorer.EarthExplorerSceneProvider

import util.DirectoryStructure;
import fake.SynchronousJobExecutor
import static org.openforis.sepal.sceneretrieval.provider.DataSet.LANDSAT_8

class EarthExplorerSceneProviderTest extends SceneProviderTest{
    def provider = new EarthExplorerSceneProvider(
        new FakeEarthExplorerClient(),
    new SynchronousJobExecutor(),
    new FileSystemSceneDownloadCoordinator(
    new FileSystemSceneRepository(workingDir,null)
    )
    )


    def 'retrieve a scene and download/unzip the files'(){
        when:
            provider.retrieve(requestId,'Test.User', [new SceneReference(sceneId, LANDSAT_8)])
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
            callback(getClass().getResourceAsStream("/scene.tar.gz"))
        }

        @Override
        String lookupDownloadLink(SceneRequest sceneRequest) {
            return 'yes'
        }
    }
}
