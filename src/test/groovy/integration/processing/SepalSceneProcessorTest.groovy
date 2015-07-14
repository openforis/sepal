package integration.processing

import org.apache.commons.io.FileUtils
import org.openforis.sepal.scene.retrieval.SepalSceneProcessor
import org.openforis.sepal.scene.retrieval.FileSystemSceneRepository
import org.openforis.sepal.scene.SceneReference
import org.openforis.sepal.scene.SceneRequest
import spock.lang.Specification
import util.DirectoryStructure

import static org.openforis.sepal.scene.DataSet.LANDSAT_8

class SepalSceneProcessorTest extends Specification {
    def workingDir = File.createTempDir('workingDir', null)
    def sceneRepo = new FileSystemSceneRepository(workingDir, null)
    def processingScript = setupProcessingScript()
    def processor = new SepalSceneProcessor(sceneRepo, new File(workingDir, 'scripts'))

    def sceneRequest = new SceneRequest(11L, new SceneReference('L45345', LANDSAT_8), processingScript, 'username')

    def 'Processing a scene executes the script in the scene directory'() {
        sceneRepo.createSceneDir(sceneRequest)

        when:
        processor.processScene(sceneRequest)

        then:
        DirectoryStructure.matches(new File(workingDir, "" + sceneRequest.id)) {
            "${sceneRequest.sceneReference.dataSet.name()}" {
                "$sceneRequest.sceneReference.id" {
                    'file_create_by_script.txt'()
                }
            }
        }
    }

    private String setupProcessingScript() {
        def scriptResourceUrl = SepalSceneProcessorTest.getResource("/scripts")
        def scriptFolder = new File(scriptResourceUrl.toURI())
        FileUtils.copyDirectoryToDirectory(scriptFolder, workingDir)

        def windows = System.getProperty("os.name").toLowerCase().contains("windows")
        return new File("${LANDSAT_8.name()}/${windows ? "test.cmd" : "test.sh"}").toString()
    }
}
