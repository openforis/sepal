package org.openforis.sepal.component.datasearch

import groovymvc.Controller
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.datasearch.adapter.CsvBackedSentinel2Gateway
import org.openforis.sepal.component.datasearch.adapter.CsvBackedUsgsGateway
import org.openforis.sepal.component.datasearch.adapter.HttpGoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.adapter.JdbcSceneMetaDataRepository
import org.openforis.sepal.component.datasearch.api.DataSetMetadataGateway
import org.openforis.sepal.component.datasearch.api.GoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.command.UpdateSentinel2SceneMetaData
import org.openforis.sepal.component.datasearch.command.UpdateSentinel2SceneMetaDataHandler
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaData
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaDataHandler
import org.openforis.sepal.component.datasearch.endpoint.DataSearchEndpoint
import org.openforis.sepal.component.datasearch.query.*
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager

import java.util.concurrent.TimeUnit

final class DataSearchComponent extends DataSourceBackedComponent implements EndpointRegistry {
    private final GoogleEarthEngineGateway geeGateway
    private final String googleMapsApiKey

    static DataSearchComponent create(SqlConnectionManager connectionManager) {
        def config = new DataSearchConfig()
        new DataSearchComponent(
                connectionManager,
                new HttpGoogleEarthEngineGateway(config.googleEarthEngineEndpoint),
                CsvBackedUsgsGateway.create(new File(config.downloadWorkingDirectory)),
                CsvBackedSentinel2Gateway.create(new File(config.downloadWorkingDirectory)),
                config.googleMapsApiKey,
                new AsynchronousEventDispatcher()
        )
    }

    DataSearchComponent(
            SqlConnectionManager connectionManager,
            GoogleEarthEngineGateway geeGateway,
            DataSetMetadataGateway landsatMetadata,
            DataSetMetadataGateway sentinel2Metadata,
            String googleMapsApiKey,
            HandlerRegistryEventDispatcher eventDispatcher) {
        super(connectionManager, eventDispatcher)
        this.geeGateway = geeGateway
        this.googleMapsApiKey = googleMapsApiKey
        def sceneMetaDataRepository = new JdbcSceneMetaDataRepository(connectionManager)

        command(UpdateUsgsSceneMetaData, new UpdateUsgsSceneMetaDataHandler(landsatMetadata, sceneMetaDataRepository))
        command(UpdateSentinel2SceneMetaData, new UpdateSentinel2SceneMetaDataHandler(sentinel2Metadata, sceneMetaDataRepository))

        query(FindSceneAreasForAoi, new FindSceneAreasForAoiHandler(geeGateway))
        query(FindScenesForSceneArea, new FindScenesForSceneAreaHandler(sceneMetaDataRepository))
        query(FindBestScenes, new FindBestScenesHandler(sceneMetaDataRepository))
    }

    void onStart() {
        schedule(1, TimeUnit.DAYS,
                new UpdateUsgsSceneMetaData(),
                new UpdateSentinel2SceneMetaData()
        )
    }

    void registerEndpointsWith(Controller controller) {
        new DataSearchEndpoint(
                this,
                geeGateway,
                googleMapsApiKey
        ).registerWith(controller)
    }
}
