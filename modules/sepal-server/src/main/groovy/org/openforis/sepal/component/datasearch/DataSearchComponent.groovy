package org.openforis.sepal.component.datasearch

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.datasearch.adapter.HttpGoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.adapter.JdbcSceneMetaDataRepository
import org.openforis.sepal.component.datasearch.api.GoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.endpoint.DataSearchEndpoint
import org.openforis.sepal.component.datasearch.query.*
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import org.slf4j.LoggerFactory

import java.util.concurrent.TimeUnit

final class DataSearchComponent extends DataSourceBackedComponent implements EndpointRegistry {
    private final static LOG = LoggerFactory.getLogger(this)
    private final Component taskComponent
    private final GoogleEarthEngineGateway geeGateway
    private final String googleMapsApiKey
    private final String nicfiPlanetApiKey

    static DataSearchComponent create(
        Component processingRecipeComponent,
        Component taskComponent,
        SqlConnectionManager connectionManager) {
        def config = new DataSearchConfig()
        new DataSearchComponent(
            processingRecipeComponent,
            taskComponent,
            connectionManager,
            new HttpGoogleEarthEngineGateway(config.googleEarthEngineEndpoint),
            config.googleMapsApiKey,
            config.nicfiPlanetApiKey,
            new AsynchronousEventDispatcher()
        )
    }

    DataSearchComponent(
        Component processingRecipeComponent,
        Component taskComponent,
        SqlConnectionManager connectionManager,
        GoogleEarthEngineGateway geeGateway,
        String googleMapsApiKey,
        String nicfiPlanetApiKey,
        HandlerRegistryEventDispatcher eventDispatcher) {
        super(connectionManager, eventDispatcher)
        this.taskComponent = taskComponent
        this.geeGateway = geeGateway
        this.googleMapsApiKey = googleMapsApiKey
        this.nicfiPlanetApiKey = nicfiPlanetApiKey
        def sceneMetaDataRepository = new JdbcSceneMetaDataRepository(connectionManager)

        query(FindSceneAreasForAoi, new FindSceneAreasForAoiHandler(geeGateway))
        query(FindScenesForSceneArea, new FindScenesForSceneAreaHandler(sceneMetaDataRepository))
        query(FindBestScenes, new FindBestScenesHandler(sceneMetaDataRepository))
    }

    void registerEndpointsWith(Controller controller) {
        new DataSearchEndpoint(
            this,
            geeGateway,
            googleMapsApiKey,
            nicfiPlanetApiKey,
        ).registerWith(controller)
    }
}
