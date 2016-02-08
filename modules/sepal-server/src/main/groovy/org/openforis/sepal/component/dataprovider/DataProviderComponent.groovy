package org.openforis.sepal.component.dataprovider

import groovymvc.Controller
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.component.dataprovider.management.*
import org.openforis.sepal.component.dataprovider.retrieval.SceneRetrievalComponent
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.transaction.SqlConnectionManager

final class DataProviderComponent implements EndpointRegistry {
    private final SceneManager sceneManager
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final SqlConnectionManager connectionManager

    DataProviderComponent(SepalConfiguration config) {
        connectionManager = new SqlConnectionManager(config.dataSource)
        def scenesDownloadRepo = new JdbcScenesDownloadRepository(connectionManager)
        def retrievalComponent = new SceneRetrievalComponent(config)
        sceneManager = new SceneManager(
                retrievalComponent.sceneProvider,
                retrievalComponent.sceneProcessor,
                retrievalComponent.scenePublisher,
                scenesDownloadRepo
        )
        sceneManager.downloadCheckInterval = config.downloadCheckInterval
        retrievalComponent
                .register(scenesDownloadRepo, sceneManager)
                .registerRequestListener(scenesDownloadRepo, sceneManager)

        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(RequestScenesDownloadCommand, new RequestScenesDownloadCommandHandler(scenesDownloadRepo))
                .register(RemoveRequestCommand, new RemoveRequestCommandHandler(scenesDownloadRepo))
                .register(RemoveSceneCommand, new RemoveSceneCommandHandler(scenesDownloadRepo))
    }

    DataProviderComponent start() {
        sceneManager.start()
        return this
    }

    void stop() {
        sceneManager.stop()
    }

    void registerEndpointsWith(Controller controller) {
        new ScenesDownloadEndPoint(
                commandDispatcher,
                new JdbcDataSetRepository(connectionManager),
                new JdbcScenesDownloadRepository(connectionManager)
        ).registerWith(controller)
    }
}
