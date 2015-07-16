package org.openforis.sepal

import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.scene.management.SceneManager
import org.openforis.sepal.scene.management.ScenesDownloadEndPoint
import org.openforis.sepal.geoserver.GeoServerLayerMonitor
import org.openforis.sepal.scene.management.DataSetRepository

import org.openforis.sepal.scene.retrieval.SceneRetrievalComponent
import org.openforis.sepal.scene.management.JdbcScenesDownloadRepository
import org.openforis.sepal.scene.management.RequestScenesDownloadCommandHandler
import org.openforis.sepal.transaction.SqlConnectionManager

class Main {
    static void main(String[] args) {
        def propertiesLocation = args.length == 1 ? args[0] : "/etc/sdms/sepal.properties"
        SepalConfiguration.instance.setConfigFileLocation(propertiesLocation)

       // deployEndpoints()
       // startSceneManager()
        startLayerMonitor()
    }

    def static startLayerMonitor() {
        GeoServerLayerMonitor.start()
    }

    def static startSceneManager() {
        def scenesDownloadRepo = new JdbcScenesDownloadRepository(
                new SqlConnectionManager(
                        SepalConfiguration.instance.dataSource
                )
        )
        def retrievalComponent = new SceneRetrievalComponent()
        def sceneManager = new SceneManager(
                retrievalComponent.sceneProvider,
                retrievalComponent.sceneProcessor,
                retrievalComponent.scenePublisher,
                scenesDownloadRepo)

        retrievalComponent.register(scenesDownloadRepo, sceneManager)
        sceneManager.start()
    }

    def static deployEndpoints() {
        def connectionManager = new SqlConnectionManager(SepalConfiguration.instance.dataSource)
        def scenesDownloadRepo = new JdbcScenesDownloadRepository(connectionManager)
        def commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)

        Endpoints.deploy(
                new DataSetRepository(connectionManager),
                commandDispatcher,
                new RequestScenesDownloadCommandHandler(scenesDownloadRepo),
                new ScenesDownloadEndPoint(commandDispatcher, scenesDownloadRepo)
        )
    }

}
