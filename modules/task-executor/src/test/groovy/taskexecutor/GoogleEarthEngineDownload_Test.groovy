package taskexecutor

import fake.server.GoogleEarthEngineDownloadServer
import org.openforis.sepal.taskexecutor.api.Progress
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskExecutor
import org.openforis.sepal.taskexecutor.gee.GoogleEarthEngineDownload
import org.openforis.sepal.taskexecutor.gee.HttpGoogleEarthEngineGateway
import org.openforis.sepal.taskexecutor.util.SleepingScheduler
import spock.lang.Specification
import spock.lang.Timeout

import java.util.concurrent.TimeUnit

import static org.openforis.sepal.taskexecutor.gee.Status.State.*

@Timeout(2)
class GoogleEarthEngineDownload_Test extends Specification {
    def workingDir = File.createTempDir()
    def server = new GoogleEarthEngineDownloadServer(workingDir).start() as GoogleEarthEngineDownloadServer
    def username = System.getProperty("user.name")
    def scheduler = new SleepingScheduler(0, TimeUnit.SECONDS)
    def gateway = new HttpGoogleEarthEngineGateway(server.uri)
    def factory = new GoogleEarthEngineDownload.Factory(workingDir, username, scheduler, gateway)
    def image = [type: 'some-type']
    def task = new Task('some-id', 'google-earth-engine-download', [name: 'some-filename', image: image])
    TaskExecutor executor

    def 'When executing task, gateway is told to download, and returns once gateway status is completed'() {
        server.states(COMPLETED)

        when:
        execute(task)

        then:
        server.requestedDownload(image)
    }

    def 'Given task without image param, when executing task, exception is thrown'() {
        when:
        execute(new Task('some-id', 'google-earth-engine-download', [name: 'some-name']))

        then:
        thrown Exception
    }

    def 'Given task without name param, when executing task, exception is thrown'() {
        when:
        execute(new Task('some-id', 'google-earth-engine-download', [image: image]))

        then:
        thrown Exception
    }

    def 'When executing task, status is checked until completed'() {
        server.states(ACTIVE, ACTIVE, COMPLETED)

        when:
        execute(task)

        then:
        server.checkedState(3)
    }

    def 'Given gateway is failing, when executing task, exception is thrown'() {
        server.states(FAILED)

        when:
        execute(task)

        then:
        thrown Exception
    }

    def 'When cancelling execution, gateway is told to cancel'() {
        def executor = factory.create(task)
        when:
        def executionThread = Thread.start {
            executor.execute()
        }
        executor.cancel()
        executionThread.join()

        then:
        server.canceled()
    }

    def 'When getting progress, latest progress is returned'() {
        server.states(COMPLETED)
        execute(task)

        when:
        def progress = executor.progress()

        then:
        progress == new Progress(COMPLETED.name())
    }

    private void execute(Task task) {
        executor = factory.create(task)
        executor.execute()
    }
}
