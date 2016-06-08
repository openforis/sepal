package endtoend

import fake.Database
import fake.FakeStorageUsageChecker
import fake.FakeUserRepository
import fake.FakeUsernamePasswordVerifier
import groovymvc.security.BasicRequestAuthenticator
import groovymvc.security.PathRestrictions
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.component.dataprovider.DataProviderComponent
import org.openforis.sepal.component.datasearch.DataSearchComponent
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.event.SynchronousEventDispatcher
import sandboxmanager.FakeClock
import sandboxmanager.FakeHostingService
import sandboxmanager.FakeSandboxSessionProvider
import sandboxmanager.FakeWorkerInstanceProvider
import spock.lang.Ignore
import spock.lang.Specification
import util.Port

import static org.openforis.sepal.SepalConfiguration.*
import static org.openforis.sepal.security.Roles.getADMIN

@Ignore
class Sepal extends Specification {
    private static Endpoints endpoints
    private static Boolean started

    static Database database
    int port
    SepalConfiguration config

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

    private void start() {
        started = true
        database = new Database()
        config = configure()

        def dataProviderComponent = new DataProviderComponent(config)
        def dataSearchComponent = new DataSearchComponent(config)
        def clock = new FakeClock()
        def sandboxManagerComponent = new SandboxManagerComponent(
                database.dataSource,
                new FakeHostingService(new FakeWorkerInstanceProvider(), clock, 0.3),
                new FakeSandboxSessionProvider(clock),
                new FakeStorageUsageChecker(),
                new SynchronousEventDispatcher(),
                clock
        )

        def userRepository = new FakeUserRepository()
        userRepository.addRole(ADMIN)
        Endpoints.deploy(
                port,
                new PathRestrictions(userRepository, new BasicRequestAuthenticator('Sepal', new FakeUsernamePasswordVerifier())),
                dataProviderComponent,
                dataSearchComponent,
                sandboxManagerComponent
        )
    }

    private SepalConfiguration configure() {
        port = Port.findFree()

        def properties = [
                (WEBAPP_PORT_PARAMETER)      : port as String,
                (MAX_CONCURRENT_DOWNLOADS)   : '1',
                (DOWNLOAD_CHECK_INTERVAL)    : '1000',
                (DOWNLOADS_WORKING_DIRECTORY): System.getProperty('java.io.tmpdir'),
                (CRAWLER_RUN_DELAY)          : '12',
                (PROCESSING_HOME_DIR)        : File.createTempDir().toString()
        ] as Properties
        def config = new SepalConfiguration(properties)
        config.dataSource = database.dataSource
        return config
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
