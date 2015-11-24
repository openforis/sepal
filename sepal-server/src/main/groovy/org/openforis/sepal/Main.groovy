package org.openforis.sepal

import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.geoserver.GeoServerLayerMonitor
import org.openforis.sepal.instance.ConcreteInstanceManager
import org.openforis.sepal.instance.JdbcInstanceDataRepository
import org.openforis.sepal.instance.amazon.AWSInstanceProviderManager
import org.openforis.sepal.instance.amazon.RestAWSClient
import org.openforis.sepal.instance.local.LocalInstanceProviderManager
import org.openforis.sepal.metadata.ConcreteMetadataProviderManager
import org.openforis.sepal.metadata.JDBCUsgsDataRepository
import org.openforis.sepal.metadata.crawling.EarthExplorerMetadataCrawler
import org.openforis.sepal.sandbox.*
import org.openforis.sepal.sandboxwebproxy.SandboxWebProxy
import org.openforis.sepal.scene.management.*
import org.openforis.sepal.scene.retrieval.SceneRetrievalComponent
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.user.JDBCUserRepository
import org.openforis.sepal.util.HttpResourceLocator

class Main {
    def static dataSetRepository
    def static connectionManager
    def static connectionManagerSandbox
    def static sandboxManager
    def static userRepository

    static void main(String[] args) {
        def propertiesLocation = args.length == 1 ? args[0] : "/etc/sepal/sepal.properties"
        SepalConfiguration.instance.setConfigFileLocation(propertiesLocation)

        startSandboxManager()
        deployEndpoints()
        startSceneManager()
        startLayerMonitor()
        startCrawling()
    }

    static startSandboxManager() {
        def config = SepalConfiguration.instance
        def daemonURI = config.dockerBaseURI

        connectionManager = new SqlConnectionManager(SepalConfiguration.instance.dataSource)
        connectionManagerSandbox = new SqlConnectionManager(SepalConfiguration.instance.sandboxDataSource)

        userRepository = new JDBCUserRepository(connectionManager)

        def instanceDataRepository = new JdbcInstanceDataRepository(connectionManagerSandbox)

        def awsProvider = new AWSInstanceProviderManager(
                new RestAWSClient(config.awsAccessKey, config.awsSecretKey)
        )

        def localProvider = new LocalInstanceProviderManager(config.sepalHost, instanceDataRepository.getDataCenterByName('Localhost'))

        def instanceManager = new ConcreteInstanceManager(
                instanceDataRepository,
                instanceDataRepository.getDataCenterByName(config.dataCenterName),
                config.environment,
                awsProvider,
                localProvider
        )

        instanceManager.bootstrap(config.sepalInstancesConfigFile)

        sandboxManager = new ConcreteSandboxManager(
                new DockerContainersProvider(new DockerRESTClient(daemonURI), userRepository),
                new JDBCSandboxDataRepository(connectionManagerSandbox),
                userRepository,
                instanceManager
        )

        sandboxManager.start(config.containerInactiveTimeout, config.deadContainersCheckInterval)
    }

    static startCrawling() {
        def metadataProviderManager = new ConcreteMetadataProviderManager(dataSetRepository)
        metadataProviderManager.registerCrawler(new EarthExplorerMetadataCrawler(new JDBCUsgsDataRepository(connectionManager), new HttpResourceLocator()))
        metadataProviderManager.start();
    }

    static startLayerMonitor() {
        GeoServerLayerMonitor.start()
    }

    static startSceneManager() {
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
        retrievalComponent.registerRequestListener(scenesDownloadRepo, sceneManager)
        sceneManager.start()
    }

    static deployEndpoints() {
        def scenesDownloadRepo = new JdbcScenesDownloadRepository(connectionManager)
        def commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)

        def proxySessionTimeout = SepalConfiguration.instance.proxySessionTimeout

        new SandboxWebProxy(9191, ['rstudio-server': 8787], sandboxManager, 30, proxySessionTimeout).start()

        dataSetRepository = new JdbcDataSetRepository(connectionManager)
        Endpoints.deploy(
                dataSetRepository,
                commandDispatcher,
                new RequestScenesDownloadCommandHandler(scenesDownloadRepo),
                new ScenesDownloadEndPoint(commandDispatcher, scenesDownloadRepo),
                scenesDownloadRepo,
                new RemoveRequestCommandHandler(scenesDownloadRepo),
                new RemoveSceneCommandHandler(scenesDownloadRepo),
                new SandboxManagerEndpoint(commandDispatcher),
                new ObtainUserSandboxCommandHandler(sandboxManager),
                new ContainerAliveCommandHandler(sandboxManager),
                userRepository
        )
    }

}
