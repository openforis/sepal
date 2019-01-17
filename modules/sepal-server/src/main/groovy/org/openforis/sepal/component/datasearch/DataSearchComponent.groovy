package org.openforis.sepal.component.datasearch

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.datasearch.adapter.CsvBackedSentinel2Gateway
import org.openforis.sepal.component.datasearch.adapter.CsvBackedUsgsGateway
import org.openforis.sepal.component.datasearch.adapter.HttpGoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.adapter.JdbcSceneMetaDataRepository
import org.openforis.sepal.component.datasearch.api.DataSetMetadataGateway
import org.openforis.sepal.component.datasearch.api.GoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.command.UpdateSceneMetaData
import org.openforis.sepal.component.datasearch.command.UpdateSceneMetaDataHandler
import org.openforis.sepal.component.datasearch.command.UpdateSentinel2SceneMetaDataHandler
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaDataHandler
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
            CsvBackedUsgsGateway.create(new File(config.downloadWorkingDirectory)),
            CsvBackedSentinel2Gateway.create(new File(config.downloadWorkingDirectory)),
            config.googleMapsApiKey,
            new AsynchronousEventDispatcher()
        )
    }

    DataSearchComponent(
        Component processingRecipeComponent,
        Component taskComponent,
        SqlConnectionManager connectionManager,
        GoogleEarthEngineGateway geeGateway,
        DataSetMetadataGateway landsatMetadata,
        DataSetMetadataGateway sentinel2Metadata,
        String googleMapsApiKey,
        HandlerRegistryEventDispatcher eventDispatcher) {
        super(connectionManager, eventDispatcher)
        this.taskComponent = taskComponent
        this.geeGateway = geeGateway
        this.googleMapsApiKey = googleMapsApiKey
        def sceneMetaDataRepository = new JdbcSceneMetaDataRepository(connectionManager)

        command(UpdateSceneMetaData, new UpdateSceneMetaDataHandler([
            new UpdateUsgsSceneMetaDataHandler(landsatMetadata, sceneMetaDataRepository),
            new UpdateSentinel2SceneMetaDataHandler(sentinel2Metadata, sceneMetaDataRepository)
        ]))

        query(FindSceneAreasForAoi, new FindSceneAreasForAoiHandler(geeGateway))
        query(FindScenesForSceneArea, new FindScenesForSceneAreaHandler(sceneMetaDataRepository))
        query(FindBestScenes, new FindBestScenesHandler(sceneMetaDataRepository))
        query(ToImageMap, new ToImageMapHandler(processingRecipeComponent))
    }

    void onStart() {
        def updateSceneMetaData = System.getProperty("skipSceneMetaDataUpdate") == null
        if (updateSceneMetaData) {
            schedule(1, TimeUnit.DAYS,
                new UpdateSceneMetaData()
            )
        } else
            LOG.info('Disabled scene metadata updates.')
    }

    void registerEndpointsWith(Controller controller) {
        new DataSearchEndpoint(
            this,
            taskComponent,
            geeGateway,
            googleMapsApiKey
        ).registerWith(controller)
    }
}
