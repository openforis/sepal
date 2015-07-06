package endtoend

import fake.Database
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.endpoint.Endpoints
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

        endpoints = new Endpoints()
        endpoints.deploy()
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
        endpoints.undeploy()
    }

    private void addShutdownHook() {
        Runtime.addShutdownHook {
            if (started)
                endpoints.undeploy()
        }
    }

}

