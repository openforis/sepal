package endtoend

import fake.Database
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.sandbox.DockerRESTClient
import org.openforis.sepal.sandbox.DockerSandboxManager
import org.openforis.sepal.sandbox.ObtainUserSandboxCommandHandler
import org.openforis.sepal.sandbox.ReleaseUserSandboxCommandHandler
import org.openforis.sepal.sandbox.SandboxManagerEndpoint
import org.openforis.sepal.scene.management.*
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.user.JDBCUserRepository
import util.Port

import static org.openforis.sepal.SepalConfiguration.*

class Sepal {
    static Database database
    private static Endpoints endpoints
    private static Boolean started
    private SqlConnectionManager connectionManager

    public int port

    Sepal init() {
        if (!started) {
            start()
            addShutdownHook()
        }
        database.reset()
        return this
    }

    SqlConnectionManager getConnectionManager(){
        this.connectionManager
    }


    private void start() {
        started = true
        database = new Database()
        configure()



        connectionManager = new SqlConnectionManager(database.dataSource)
        def scenesDownloadRepo = new JdbcScenesDownloadRepository(connectionManager)
        def commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)

        def daemonURI = SepalConfiguration.instance.dockerDaemonURI
        def imageName = SepalConfiguration.instance.dockerImageName
        def sandboxManager = new DockerSandboxManager(
                new JDBCUserRepository(connectionManager),
                new DockerRESTClient(daemonURI),
                imageName
        )

        Endpoints.deploy(
                new DataSetRepository(connectionManager),
                commandDispatcher,
                new RequestScenesDownloadCommandHandler(scenesDownloadRepo),
                new ScenesDownloadEndPoint(commandDispatcher, scenesDownloadRepo),
                scenesDownloadRepo,
                new RemoveRequestCommandHandler(scenesDownloadRepo),
                new RemoveSceneCommandHandler(scenesDownloadRepo),
                new SandboxManagerEndpoint(commandDispatcher),
                new ObtainUserSandboxCommandHandler(sandboxManager),
                new ReleaseUserSandboxCommandHandler(sandboxManager)
        )
    }

    private void configure() {
        port = Port.findFree()
        SepalConfiguration.instance.properties = [
                (WEBAPP_PORT_PARAMETER)   : port as String,
                (MAX_CONCURRENT_DOWNLOADS): '1',
                (DOWNLOAD_CHECK_INTERVAL) : '1000',
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
                endpoints.undeploy()
        }
    }

}

