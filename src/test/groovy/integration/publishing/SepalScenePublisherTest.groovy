package integration.publishing

import org.openforis.sepal.sceneretrieval.provider.FileSystemSceneRepository
import org.openforis.sepal.sceneretrieval.provider.SceneReference
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.sceneretrieval.publisher.SepalScenePublisher
import spock.lang.Specification
import util.DirectoryStructure

import static org.openforis.sepal.sceneretrieval.provider.DataSet.LANDSAT_8

class SepalScenePublisherTest extends Specification {

    def workingDir = File.createTempDir('workingDir', null)
    def homeDir = File.createTempDir('homeDir', null)

    def sceneRepo = new FileSystemSceneRepository(workingDir, new File(homeDir, "\$user/sdmsRepository").toString())
    def sceneRequest = new SceneRequest(11L, new SceneReference('L45345', LANDSAT_8), 'username')

    def publisher = new SepalScenePublisher(sceneRepo)

    def 'Publishing a scene'() {
        def sceneWorkingDirectory = sceneRepo.createScene(sceneRequest)
        def scenePublishingDirectory = sceneRepo.getSceneHomeDirectory(sceneRequest)
        new File(sceneWorkingDirectory, "image.tif").createNewFile()
        when:
        publisher.publishScene(sceneRequest)
        then:
        DirectoryStructure.matches(scenePublishingDirectory) {
            'image.tif'()
        }

    }

}
