package integration.scene.publishing

import org.openforis.sepal.scene.DownloadRequest
import org.openforis.sepal.scene.SceneReference
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.Status
import org.openforis.sepal.scene.retrieval.FileSystemSceneRepository
import org.openforis.sepal.scene.retrieval.SepalScenePublisher
import spock.lang.Specification
import util.DirectoryStructure

import static org.openforis.sepal.scene.DataSet.LANDSAT_8


class SepalScenePublisherTest extends Specification {

    def workingDir = File.createTempDir('workingDir', null)
    def homeDir = File.createTempDir('homeDir', null)

    def sceneRepo = new FileSystemSceneRepository(workingDir, new File(homeDir, "\$user/sdmsRepository").toString())
    def request = new DownloadRequest(requestId: 1L, username: 'username')
    def sceneRequest = new SceneRequest(11L, new SceneReference('L45345', LANDSAT_8), 'username', new Date(), Status.REQUESTED,request)
    def atomicRequest = new DownloadRequest(requestId: 2L, groupScenes: true, requestName: 'reqName', username: 'user')
    def sceneRequest2 = new SceneRequest(12L, new SceneReference('L45345', LANDSAT_8), 'username', new Date(), Status.REQUESTED,atomicRequest)
    def sceneRequest3 = new SceneRequest(13L, new SceneReference('L2', LANDSAT_8), 'username', new Date(), Status.REQUESTED,atomicRequest)
    def publisher = new SepalScenePublisher(sceneRepo)

    def 'Publishing a scene'() {
        request.scenes.add(sceneRequest)
        def sceneWorkingDirectory = sceneRepo.createSceneDir(sceneRequest)
        def scenePublishingDirectory = sceneRepo.getSceneHomeDirectory(sceneRequest)
        new File(sceneWorkingDirectory, "image.tif").createNewFile()
        when:
            publisher.publish(sceneRequest)
        then:
            DirectoryStructure.matches(scenePublishingDirectory) {
                'image.tif'()
            }
    }

    def 'Publishing a request'() {
        atomicRequest.scenes = [sceneRequest2, sceneRequest3]
        def sceneWorkingDirectory = sceneRepo.createSceneDir(sceneRequest2)
        sceneRepo.createSceneDir(sceneRequest3)
        def requestPublishingDirectory = sceneRepo.getDownloadRequestHomeDirectory(atomicRequest)
        new File(sceneWorkingDirectory, "image.tif").createNewFile()
        when:
        publisher.publish(atomicRequest)
        then:
        DirectoryStructure.matches(requestPublishingDirectory.parentFile) {
            "$atomicRequest.requestName"{
                "$sceneRequest3.sceneReference.id"()
                "$sceneRequest2.sceneReference.id"{
                    'image.tif'()
                }
            }
        }
    }

}
