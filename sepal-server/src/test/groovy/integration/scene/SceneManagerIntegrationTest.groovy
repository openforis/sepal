package integration.scene

import endtoend.SepalDriver
import org.apache.commons.io.FileUtils
import org.openforis.sepal.scene.*
import org.openforis.sepal.scene.management.JdbcScenesDownloadRepository
import org.openforis.sepal.scene.management.RequestScenesDownloadCommand
import org.openforis.sepal.scene.management.SceneManager
import org.openforis.sepal.scene.management.ScenesDownloadRepository
import org.openforis.sepal.scene.retrieval.provider.DownloadRequestObservable
import org.openforis.sepal.scene.retrieval.provider.SceneRetrievalObservable
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor
import org.openforis.sepal.util.JobExecutor
import spock.lang.Shared
import spock.lang.Specification

import java.util.concurrent.Executors

import static org.openforis.sepal.scene.DataSet.LANDSAT_8
import static org.openforis.sepal.scene.Status.*

class SceneManagerIntegrationTest extends Specification {
    static final WORKING_DIR = File.createTempDir('workingDir', null)
    static final DATASET_ID = 1
    static final PROCESSING_CHAIN = "scripts/LANDSAT_8/test.sh"
    static final SCENE_IDS = ["one", "two", "three"]
    static final USER = "Test.User"

    @Shared SepalDriver driver
    ScenesDownloadRepository scenesDownloadRepository
    SceneManager sceneManager
    SceneProcessor sceneProcessor
    ScenePublisher scenePublisher
    SceneProvider sceneProvider

    def setupSpec() {
        driver = new SepalDriver()
        setupProcessingScript()
    }

    def setup() {
        scenePublisher = Spy(MockSepalScenePublisher)
        sceneProcessor = Spy(MockSceneProcessor)
        sceneProvider = Spy(MockSceneProvider)
        scenesDownloadRepository = Spy(JdbcScenesDownloadRepository, constructorArgs: [driver.getSQLManager()])
        sceneManager = new SceneManager(sceneProvider, sceneProcessor, scenePublisher, scenesDownloadRepository)

        scenePublisher.register(scenesDownloadRepository, sceneManager)
        sceneProcessor.register(scenesDownloadRepository, sceneManager)
        sceneProvider.register(scenesDownloadRepository, sceneManager)

        scenePublisher.registerDownloadRequestListener(scenesDownloadRepository, sceneManager)
        sceneProcessor.registerDownloadRequestListener(scenesDownloadRepository, sceneManager)
    }

    def cleanupSpec() {
        driver.stop()
    }

    private String setupProcessingScript() {
        def scriptResourceUrl = SceneManagerIntegrationTest.getResource("/scripts")
        def scriptFolder = new File(scriptResourceUrl.toURI())
        FileUtils.copyDirectoryToDirectory(scriptFolder, WORKING_DIR)
        def windows = System.getProperty("os.name").toLowerCase().contains("windows")
        File scriptFile = new File("${LANDSAT_8.name()}/${windows ? "test.cmd" : "test.sh"}")
        File workingScriptFolder = new File(WORKING_DIR, "scripts")
        new File(workingScriptFolder, scriptFile.toString()).setExecutable(true)
        return scriptFile.toString()
    }


    def 'Working with an atomic request, the scene manager behaves correctly'() {
        given:
            insertRequest()
            DownloadRequest downloadRequest = scenesDownloadRepository.newDownloadRequests.first()
        when:
            sceneManager.requestStatusChanged(downloadRequest, REQUESTED)
        then:
            driver.eventually {
                1 * sceneProvider.retrieve(downloadRequest.scenes)
                3 * scenesDownloadRepository.hasStatus(1, DOWNLOADED)
                1 * sceneProcessor.process(_ as DownloadRequest, _ as String)
                1 * scenePublisher.publish(_ as DownloadRequest)
            }

    }

    private void insertRequest(def userName = USER) {
        RequestScenesDownloadCommand downloadCommand = new RequestScenesDownloadCommand(
                dataSetId: DATASET_ID,
                processingChain: PROCESSING_CHAIN,
                groupScenes: true,
                sceneIds: SCENE_IDS,
                username: userName
        )
        scenesDownloadRepository.saveDownloadRequest(downloadCommand)
    }

    private class MockSceneProvider implements SceneProvider {
        @Delegate
        @SuppressWarnings("GroovyUnusedDeclaration")
        private final SceneRetrievalObservable sceneRetrievalObservable = new SceneRetrievalObservable()

        @Override
        Collection<SceneRequest> retrieve(List<SceneRequest> requests) {
            requests.each { SceneRequest req ->
                notifyListeners(req, DOWNLOADED)
            }
            return []
        }

        @Override
        void stop() {

        }
    }

    private class MockSceneProcessor implements SceneProcessor {

        @Delegate
        @SuppressWarnings("GroovyUnusedDeclaration")
        private final SceneRetrievalObservable sceneRetrievalObservable = new SceneRetrievalObservable()

        @Delegate
        @SuppressWarnings("GroovyUnusedDeclaration")
        private final DownloadRequestObservable downloadRequestObservable = new DownloadRequestObservable()

        @Override
        void process(SceneRequest downloadRequest) {

        }

        @Override
        void process(DownloadRequest downloadRequest, String processingChain) {
            this.notifyDownloadRequestListeners(downloadRequest, PROCESSED)
        }

    }

    private class MockSepalScenePublisher implements ScenePublisher {
        private final JobExecutor executor = new ExecutorServiceBasedJobExecutor(Executors.newSingleThreadExecutor())

        @Delegate
        @SuppressWarnings("GroovyUnusedDeclaration")
        private final SceneRetrievalObservable sceneRetrievalObservable = new SceneRetrievalObservable()

        @Delegate
        @SuppressWarnings("GroovyUnusedDeclaration")
        private final DownloadRequestObservable downloadRequestObservable = new DownloadRequestObservable()

        void publish(DownloadRequest request) {
            executor.execute {
                notifyDownloadRequestListeners(request, PUBLISHED)
            }
        }

        void publish(SceneRequest request) {}
    }

}
