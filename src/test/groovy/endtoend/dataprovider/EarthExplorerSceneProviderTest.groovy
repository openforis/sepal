package endtoend.dataprovider



import org.openforis.sepal.dataprovider.FileSystemSceneDownloadCoordinator
import org.openforis.sepal.dataprovider.FileSystemSceneRepository
import org.openforis.sepal.dataprovider.SceneReference
import org.openforis.sepal.dataprovider.SceneRequest
import org.openforis.sepal.dataprovider.earthexplorer.EarthExplorerClient
import org.openforis.sepal.dataprovider.earthexplorer.EarthExplorerSceneProvider

import util.DirectoryStructure;
import fake.SynchronousJobExecutor
import static org.openforis.sepal.dataprovider.DataSet.LANDSAT_8

class EarthExplorerSceneProviderTest extends SceneProviderTest{
    def provider = new EarthExplorerSceneProvider(
        new FakeEarthExplorerClient(),
    new SynchronousJobExecutor(),
    new FileSystemSceneDownloadCoordinator(
    new FileSystemSceneRepository(workingDir)
    )
    )


    def 'retrieve a scene and download/unzip the files'(){
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


    static class FakeEarthExplorerClient implements EarthExplorerClient{

        @Override
        public void download(SceneRequest sceneRequest, Closure callback) {
            callback(getClass().getResourceAsStream("/scene.tar.gz"))
        }
    }
}
