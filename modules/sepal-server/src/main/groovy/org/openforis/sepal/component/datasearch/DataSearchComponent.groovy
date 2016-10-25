package org.openforis.sepal.component.datasearch

import groovymvc.Controller
import org.openforis.sepal.command.Command
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.component.datasearch.adapter.HttpGoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.api.GoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaData
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaDataHandler
import org.openforis.sepal.component.datasearch.endpoint.DataSearchEndpoint
import org.openforis.sepal.component.datasearch.query.*
import org.openforis.sepal.component.datasearch.usgs.CsvBackedUsgsGateway
import org.openforis.sepal.component.datasearch.usgs.UsgsGateway
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.query.HandlerRegistryQueryDispatcher
import org.openforis.sepal.query.Query
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.lifecycle.Lifecycle

import javax.sql.DataSource

final class DataSearchComponent implements EndpointRegistry, Lifecycle {
    private final SqlConnectionManager connectionManager
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final HandlerRegistryQueryDispatcher queryDispatcher
    private final GoogleEarthEngineGateway geeGateway
    private final SceneMetaDataRepository sceneMetaDataRepository
    private final SceneMetaDataUpdateScheduler sceneMetaDataUpdateScheduler
    private final String googleMapsApiKey

    static DataSearchComponent create(DataSource dataSource) {
        def config = new DataSearchConfig()
        new DataSearchComponent(
                new SqlConnectionManager(dataSource),
                new HttpGoogleEarthEngineGateway(config.googleEarthEngineEndpoint),
                CsvBackedUsgsGateway.create(new File(config.downloadWorkingDirectory)),
                config.googleMapsApiKey)
    }

    DataSearchComponent(
            SqlConnectionManager connectionManager,
            GoogleEarthEngineGateway geeGateway,
            UsgsGateway usgs,
            googleMapsApiKey) {
        this.connectionManager = connectionManager
        this.geeGateway = geeGateway
        this.sceneMetaDataRepository = new JdbcSceneMetaDataRepository(connectionManager)
        this.googleMapsApiKey = googleMapsApiKey
        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(UpdateUsgsSceneMetaData, new UpdateUsgsSceneMetaDataHandler(usgs, sceneMetaDataRepository))

        queryDispatcher = new HandlerRegistryQueryDispatcher()
                .register(FindSceneAreasForAoi, new FindSceneAreasForAoiHandler(geeGateway))
                .register(FindScenesForSceneArea, new FindScenesForSceneAreaHandler(sceneMetaDataRepository))
                .register(FindBestScenes, new FindBestScenesHandler(sceneMetaDataRepository))

        sceneMetaDataUpdateScheduler = new SceneMetaDataUpdateScheduler(commandDispatcher)
    }

    def <R> R submit(Command<R> command) {
        commandDispatcher.submit(command)
    }

    def <R> R submit(Query<R> query) {
        queryDispatcher.submit(query)
    }

    void start() {
        sceneMetaDataUpdateScheduler.start()
    }

    void stop() {
        sceneMetaDataUpdateScheduler.stop()
        connectionManager.stop()

    }

    void registerEndpointsWith(Controller controller) {
        new DataSearchEndpoint(
                queryDispatcher,
                commandDispatcher,
                geeGateway,
                googleMapsApiKey
        ).registerWith(controller)
    }
}
