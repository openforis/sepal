package org.openforis.sepal

import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.endpoint.ScenesDownloadEndPoint
import org.openforis.sepal.geoserver.GeoServerLayerMonitor
import org.openforis.sepal.repository.DataSetRepository
import org.openforis.sepal.sceneretrieval.SceneRetrievalComponent
import org.openforis.sepal.sceneretrieval.processor.SepalSceneProcessor
import org.openforis.sepal.sceneretrieval.provider.FileSystemSceneRepository
import org.openforis.sepal.sceneretrieval.publisher.SepalScenePublisher
import org.openforis.sepal.scenesdownload.JdbcScenesDownloadRepository
import org.openforis.sepal.scenesdownload.RequestScenesDownloadHandler
import org.openforis.sepal.transaction.SqlConnectionManager

import static org.openforis.sepal.util.FileSystem.toDir

class Main {
    static void main(String[] args) {
        def propertiesLocation = args.length == 1 ? args[0] : "/etc/sdms/sepal.properties"
        SepalConfiguration.instance.setConfigFileLocation(propertiesLocation)

        deployEndpoints()
        startSceneManager()
        startLayerMonitor()
    }

    def static startLayerMonitor(){
        GeoServerLayerMonitor.start()
    }

    def static startSceneManager(){
        def scenesDownloadRepo = new JdbcScenesDownloadRepository(
                new SqlConnectionManager(
                        SepalConfiguration.instance.dataSource
                )
        )
        def retrievalComponent = new SceneRetrievalComponent(scenesDownloadRepo)
        def sceneRepository = new FileSystemSceneRepository(
                toDir(SepalConfiguration.instance.downloadWorkingDirectory),
                SepalConfiguration.instance.getUserHomeDir()
        )
        def sceneManager = new SceneManager(
                retrievalComponent.sceneProvider,
                new SepalSceneProcessor(
                        sceneRepository,
                        toDir(SepalConfiguration.instance.processingHomeDir)
                ),
                new SepalScenePublisher(sceneRepository),
                scenesDownloadRepo)

        retrievalComponent.register(sceneManager)
        sceneManager.start()
    }

    def static deployEndpoints(){
        def connectionManager = new SqlConnectionManager(SepalConfiguration.instance.dataSource)
        def scenesDownloadRepo = new JdbcScenesDownloadRepository(connectionManager)
        def commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)

        Endpoints.deploy(
                new DataSetRepository(connectionManager),
                commandDispatcher,
                new RequestScenesDownloadHandler(scenesDownloadRepo),
                new ScenesDownloadEndPoint(commandDispatcher, scenesDownloadRepo)
        )
    }

}
