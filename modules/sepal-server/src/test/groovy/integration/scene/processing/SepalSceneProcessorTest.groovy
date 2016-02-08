package integration.scene.processing

import org.apache.commons.io.FileUtils
import org.openforis.sepal.component.dataprovider.DownloadRequest
import org.openforis.sepal.component.dataprovider.SceneReference
import org.openforis.sepal.component.dataprovider.SceneRequest
import org.openforis.sepal.component.dataprovider.Status
import org.openforis.sepal.component.dataprovider.retrieval.FileSystemSceneRepository
import org.openforis.sepal.component.dataprovider.retrieval.SepalSceneProcessor
import spock.lang.Specification
import util.DirectoryStructure

import static org.openforis.sepal.component.dataprovider.DataSet.LANDSAT_8

class SepalSceneProcessorTest extends Specification {
    def workingDir = File.createTempDir('workingDir', null)
    def sceneRepo = new FileSystemSceneRepository(workingDir, null)
    def processingScript = setupProcessingScript()
    def processor = new SepalSceneProcessor(sceneRepo, new File(workingDir, 'scripts'))

    def request = new DownloadRequest(requestId: 1L, groupScenes: false, dataSet: LANDSAT_8)
    def atomicRequest = new DownloadRequest(requestId: 2L, groupScenes: true, dataSet: LANDSAT_8)
    def sceneRequest = new SceneRequest(11L, new SceneReference('L45345', LANDSAT_8), processingScript, new Date(), Status.REQUESTED, request)
    def sceneRequest2 = new SceneRequest(12L, new SceneReference('L45345', LANDSAT_8), processingScript, new Date(), Status.REQUESTED, atomicRequest)

    def 'Processing a scene executes the script in the scene directory'() {
        request.scenes.add(sceneRequest)
        sceneRepo.createSceneDir(sceneRequest)

        when:
        processor.process(sceneRequest)
        then:
        DirectoryStructure.matches(new File(workingDir, "" + request.requestId)) {
            "${sceneRequest.sceneReference.dataSet.name()}" {
                "$sceneRequest.sceneReference.id" {
                    'file_create_by_script.txt'()
                }
            }
        }
    }

    def 'Processing an atomic requests  executes the script in the request directory'() {
        atomicRequest.scenes.add(sceneRequest2)
        sceneRepo.createSceneDir(sceneRequest2)
        when:
        processor.process(atomicRequest, processingScript)
        then:
        DirectoryStructure.matches(new File(workingDir, "" + atomicRequest.requestId)) {
            "${sceneRequest2.sceneReference.dataSet.name()}" {
                'file_create_by_script.txt'()
                "$sceneRequest2.sceneReference.id"()

            }
        }
    }

    private String setupProcessingScript() {
        def scriptResourceUrl = SepalSceneProcessorTest.getResource("/scripts")
        def scriptFolder = new File(scriptResourceUrl.toURI())
        FileUtils.copyDirectoryToDirectory(scriptFolder, workingDir)
        def windows = System.getProperty("os.name").toLowerCase().contains("windows")
        File scriptFile = new File("${LANDSAT_8.name()}/${windows ? "test.cmd" : "test.sh"}")
        File workingScriptFolder = new File(workingDir, "scripts")
        new File(workingScriptFolder, scriptFile.toString()).setExecutable(true)
        return scriptFile.toString()
    }
}
