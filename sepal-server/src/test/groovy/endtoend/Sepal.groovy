package endtoend

import fake.Database
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.instance.ConcreteInstanceManager
import org.openforis.sepal.instance.JdbcInstanceDataRepository
import org.openforis.sepal.instance.amazon.AWSInstanceProviderManager
import org.openforis.sepal.instance.local.LocalInstanceProviderManager
import org.openforis.sepal.sandbox.*
import org.openforis.sepal.scene.management.*
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.user.JDBCUserRepository
import spock.lang.Ignore
import spock.lang.Specification
import util.Port

import static org.openforis.sepal.SepalConfiguration.*

@Ignore
class Sepal extends Specification {
    static Database database
    static Endpoints endpoints
    static Boolean started
    static SandboxManager sandboxManager
    SqlConnectionManager connectionManager

    int port

    Sepal init() {
        if (!started) {
            start()
            addShutdownHook()
        }
        database.reset()
        return this
    }

    static void resetDatabase() {
        database.reset()
    }

    SqlConnectionManager getConnectionManager() {
        this.connectionManager
    }

    SandboxManager getSandboxManager() { return sandboxManager }


    private void start() {
        started = true
        database = new Database()
        configure()

        connectionManager = new SqlConnectionManager(database.dataSource)
        def scenesDownloadRepo = new JdbcScenesDownloadRepository(connectionManager)
        def commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)


        def userRepository = new JDBCUserRepository(connectionManager)

        def stubDockerClient = Stub(DockerClient) {
            isContainerRunning(_) >> {
                true
            }
            createContainer(_, _) >> {
                new SandboxData(username: it.get(0), containerId: 'Some.Id', uri: 'Some_URI')
            }
        }

        def instanceDataRepository = new JdbcInstanceDataRepository(connectionManager)
        def config = SepalConfiguration.instance


        // @ TODO Implement Stub For AWSClient
        def awsProvider = new AWSInstanceProviderManager(
                null
        )

        def localProvider = new LocalInstanceProviderManager(config.sepalHost, instanceDataRepository.getDataCenterByName('Localhost'))

        def instanceManager = new ConcreteInstanceManager(
                instanceDataRepository,
                instanceDataRepository.getDataCenterByName(config.dataCenterName),
                config.environment,
                awsProvider,
                localProvider
        )

        sandboxManager = new ConcreteSandboxManager(
                new DockerContainersProvider(stubDockerClient, userRepository),
                new JDBCSandboxDataRepository(connectionManager),
                userRepository,
                instanceManager
        )

        def dataSetRepository = new JdbcDataSetRepository(connectionManager)


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

    private void configure() {
        port = Port.findFree()
        SepalConfiguration.instance.properties = [
                (WEBAPP_PORT_PARAMETER)      : port as String,
                (MAX_CONCURRENT_DOWNLOADS)   : '1',
                (DOWNLOAD_CHECK_INTERVAL)    : '1000',
                (DOWNLOADS_WORKING_DIRECTORY): System.getProperty('java.io.tmpdir'),
                (CRAWLER_RUN_DELAY)          : '12'
        ] as Properties
        SepalConfiguration.instance.dataSource = database.dataSource
    }

    void stop() {
        started = false
        database.reset()
        Endpoints.undeploy()
    }

    private void addShutdownHook() {
        Runtime.addShutdownHook {
            if (started)
                endpoints?.undeploy()
        }
    }

}

