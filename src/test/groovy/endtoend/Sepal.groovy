package endtoend

import fake.Database
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.endpoint.ScenesDownloadEndPoint
import org.openforis.sepal.repository.DataSetRepository
import org.openforis.sepal.scenesdownload.JdbcScenesDownloadRepository
import org.openforis.sepal.scenesdownload.RequestScenesDownloadHandler
import org.openforis.sepal.transaction.SqlConnectionManager
import org.slf4j.LoggerFactory
import util.Port

import java.util.logging.Logger

import static org.openforis.sepal.SepalConfiguration.*

class Sepal {
    static Database database
    private static Endpoints endpoints
    private static Boolean started
    public int port

    Sepal init() {
        if (!started) {
            start()
            addShutdownHook()
        }
        database.reset()
        return this
    }


    private void start() {
        started = true
        database = new Database()
        configure()



        SqlConnectionManager connectionManager = new SqlConnectionManager(database.dataSource)
        def scenesDownloadRepo = new JdbcScenesDownloadRepository(connectionManager)
        def commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)

        Endpoints.deploy(
                new DataSetRepository(connectionManager),
                commandDispatcher,
                new RequestScenesDownloadHandler(scenesDownloadRepo),
                new ScenesDownloadEndPoint(commandDispatcher, scenesDownloadRepo)
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

