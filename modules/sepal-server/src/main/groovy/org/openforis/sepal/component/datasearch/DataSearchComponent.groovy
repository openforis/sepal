package org.openforis.sepal.component.datasearch

import groovymvc.Controller
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.component.dataprovider.management.JdbcDataSetRepository
import org.openforis.sepal.component.datasearch.metadata.ConcreteMetadataProviderManager
import org.openforis.sepal.component.datasearch.metadata.JDBCUsgsDataRepository
import org.openforis.sepal.component.datasearch.metadata.MetadataProviderManager
import org.openforis.sepal.component.datasearch.metadata.crawling.EarthExplorerMetadataCrawler
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.HttpResourceLocator

final class DataSearchComponent implements EndpointRegistry {
    private final MetadataProviderManager metadataProviderManager

    DataSearchComponent(SepalConfiguration config) {
        def connectionManager = new SqlConnectionManager(config.dataSource)
        def dataSetRepository = new JdbcDataSetRepository(connectionManager)
        metadataProviderManager = new ConcreteMetadataProviderManager(dataSetRepository, config.crawlerRunDelay)
        this.metadataProviderManager.registerCrawler(
                new EarthExplorerMetadataCrawler(
                        new JDBCUsgsDataRepository(connectionManager),
                        new HttpResourceLocator(),
                        config.downloadWorkingDirectory
                )
        )
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
}
