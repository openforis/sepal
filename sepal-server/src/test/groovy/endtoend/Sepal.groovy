package endtoend

import fake.Database
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.instance.ConcreteInstanceManager
import org.openforis.sepal.instance.JdbcInstanceDataRepository
import org.openforis.sepal.instance.amazon.AWSInstanceProviderManager
import org.openforis.sepal.instance.local.LocalInstanceProviderManager
import org.openforis.sepal.scene.management.*
import org.openforis.sepal.session.ConcreteSepalSessionManager
import org.openforis.sepal.session.JDBCSepalSessionRepository
import org.openforis.sepal.session.SepalSessionEndpoint
import org.openforis.sepal.session.SepalSessionManager
import org.openforis.sepal.session.command.BindToUserSessionCommandHandler
import org.openforis.sepal.session.command.GetUserSessionsCommandHandler
import org.openforis.sepal.session.command.ObtainUserSessionCommandHandler
import org.openforis.sepal.session.command.SessionAliveCommandHandler
import org.openforis.sepal.session.docker.DockerClient
import org.openforis.sepal.session.docker.DockerSessionContainerProvider
import org.openforis.sepal.session.model.SepalSession
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
    static SepalSessionManager sepalSessionManager
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

    SepalSessionManager getSandboxManager() { return sepalSessionManager }


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
                new SepalSession(username: it.get(0), containerId: 'Some.Id', containerURI: 'Some_URI')
            }
        }

        def instanceDataRepository = new JdbcInstanceDataRepository(connectionManager)
        def config = SepalConfiguration.instance


        // @ TODO Implement Stub For AWSClient
        def awsProvider = new AWSInstanceProviderManager(
                null,
                config.availabilityZoneName
        )

        def localProvider = new LocalInstanceProviderManager(config.sepalHost, instanceDataRepository.getDataCenterByName('Localhost'))

        def instanceManager = new ConcreteInstanceManager(
                instanceDataRepository,
                instanceDataRepository.getDataCenterByName(config.dataCenterName),
                config.environment,
                awsProvider,
                localProvider
        )

        sepalSessionManager = new ConcreteSepalSessionManager(
                new DockerSessionContainerProvider(stubDockerClient, userRepository),
                new JDBCSepalSessionRepository(connectionManager),
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
                new SepalSessionEndpoint(commandDispatcher),
                new ObtainUserSessionCommandHandler(sepalSessionManager),
                new SessionAliveCommandHandler(sepalSessionManager),
                userRepository,
                new GetUserSessionsCommandHandler(sepalSessionManager),
                new BindToUserSessionCommandHandler(sepalSessionManager)
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

