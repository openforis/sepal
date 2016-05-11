package org.openforis.sepal.component.datasearch

import groovy.transform.Immutable
import groovymvc.Controller
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.command.Command
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaData
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaDataHandler
import org.openforis.sepal.component.datasearch.metadata.MetadataProviderManager
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoi
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoiHandler
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneArea
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneAreaHandler
import org.openforis.sepal.component.datasearch.usgs.UsgsGateway
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.query.HandlerRegistryQueryDispatcher
import org.openforis.sepal.query.Query
import org.openforis.sepal.transaction.SqlConnectionManager

import javax.sql.DataSource

final class DataSearchComponent implements EndpointRegistry {
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final HandlerRegistryQueryDispatcher queryDispatcher
    private final SceneAreaProvider sceneAreaProvider
    private final SceneMetaDataRepository sceneMetaDataRepository
    private final MetadataProviderManager metadataProviderManager

    DataSearchComponent(SepalConfiguration config) {
        this(config.dataSource, null, null, new Config(
                crawlerRunDelayHours: config.crawlerRunDelay,
                downloadWorkingDirectory: config.downloadWorkingDirectory
        ))
    }

    DataSearchComponent(
            DataSource dataSource,
            SceneAreaProvider sceneAreaProvider,
            UsgsGateway usgs,
            Config config
    ) {
        this.sceneAreaProvider = sceneAreaProvider
        def connectionManager = new SqlConnectionManager(dataSource)
        this.sceneMetaDataRepository = new JdbcSceneMetaDataRepository(connectionManager)
//        def dataSetRepository = new JdbcDataSetRepository(connectionManager)
//        def crawlerRunDelayHours = config.crawlerRunDelayHours
//        metadataProviderManager = new ConcreteMetadataProviderManager(dataSetRepository, crawlerRunDelayHours)
//        this.metadataProviderManager.registerCrawler(
//                new EarthExplorerMetadataCrawler(
//                        new JDBCUsgsDataRepository(connectionManager),
//                        new HttpResourceLocator(),
//                        config.downloadWorkingDirectory
//                )
//        )

        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(UpdateUsgsSceneMetaData, new UpdateUsgsSceneMetaDataHandler(usgs, sceneMetaDataRepository))

        queryDispatcher = new HandlerRegistryQueryDispatcher()
                .register(FindSceneAreasForAoi, new FindSceneAreasForAoiHandler(sceneAreaProvider))
                .register(FindScenesForSceneArea, new FindScenesForSceneAreaHandler(sceneMetaDataRepository))
    }

    def <R> R submit(Command<R> command) {
        commandDispatcher.submit(command)
    }

    def <R> R submit(Query<R> query) {
        queryDispatcher.submit(query)
    }

    DataSearchComponent start() {
        metadataProviderManager.start();
        return this
    }

    void stop() {
        metadataProviderManager.stop()
    }

    void registerEndpointsWith(Controller controller) {

    }

    @Immutable
    static class Config {
        int crawlerRunDelayHours
        String downloadWorkingDirectory
    }
}
