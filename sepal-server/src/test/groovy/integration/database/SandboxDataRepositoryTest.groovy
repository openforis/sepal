package integration.database

import endtoend.SepalDriver
import org.openforis.sepal.sandbox.JDBCSandboxDataRepository
import org.openforis.sepal.sandbox.SandboxDataRepository
import spock.lang.Shared
import spock.lang.Specification

import static org.openforis.sepal.sandbox.SandboxStatus.*

/**
 * Created by ottavio on 02/11/15.
 */

class SandboxDataRepositoryTest extends Specification{

    private static final A_USERNAME = "A_USERNAME"
    private static final A_USERNAME_2 = "A_USERNAME_2"
    private static final A_CONTAINER_ID = "A_CONTAINER_ID"
    private static final A_CONTAINER_ID_2 = "A_CONTAINER_ID_2"
    private static final A_URI_2 = "A_URI_2"
    private static final A_URI = "A_URI"

    @Shared SepalDriver driver
    @Shared sandboxId
    SandboxDataRepository repository

    def setupSpec(){
        driver = new SepalDriver()
    }

    def cleanupSpec(){
        driver?.stop()
    }

    def cleanup(){
        driver.resetDatabase()
    }

    def setup(){
        repository = new JDBCSandboxDataRepository(driver.getSQLManager())
        sandboxId = create()
    }



    def 'trying to store alive signal for an non existent sandbox fail'(){
        when:
        def stored = repository.alive(new Random().nextInt())
        then:
        !stored
    }

    def 'storing alive signal works as expected'(){
        when:
        def updated = repository.alive(sandboxId)
        def sandboxes = repository.getSandboxes(ALIVE)
        then:
        updated
        sandboxes.first().status == ALIVE
    }

    def 'notifying the database that a sandbox has been terminated works as expected'(){
        when:
        repository.terminated(sandboxId)
        def sandboxes = repository.getSandboxes(TERMINATED)
        then:
        sandboxes
        sandboxes.first().status == TERMINATED
    }

    def 'notifying the database that a sandbox has been created works as expected'(){
        when:
        def sandboxes = repository.getSandboxes(CREATED)
        then:
        sandboxes
        sandboxes.size() == 1
        sandboxes.first().status == CREATED
        sandboxes.first().sandboxId == sandboxId
        sandboxes.first().containerId == A_CONTAINER_ID
        sandboxes.first().username == A_USERNAME
    }

    def 'notifying the database that a sandbox has been started works as expected'(){
        when:
        repository.started(sandboxId,A_URI)
        def sandboxes = repository.getSandboxes(RUNNING)
        then:
        sandboxes
        sandboxes.size() == 1
        sandboxes.first().uri == A_URI
    }

    def 'performing queries over the table containing sandboxes info works as expected'(){
        given:
        def allSandboxes = repository.getSandboxes()
        def allCreatedSandboxes = repository.getSandboxes(CREATED)
        def allStartedSandboxes = repository.getSandboxes(RUNNING)
        when:
        int newId = create(A_USERNAME_2,A_CONTAINER_ID_2)
        repository.started(newId,A_URI_2)
        def allSandboxes2 = repository.getSandboxes()
        def allCreatedSandboxes2 = repository.getSandboxes(CREATED)
        def allStartedSandboxes2 = repository.getSandboxes(RUNNING)
        then:
        allSandboxes && allCreatedSandboxes && !allStartedSandboxes
        allSandboxes2 && allCreatedSandboxes2 && allStartedSandboxes2
        allSandboxes.size() == 1 && allCreatedSandboxes.size() == 1
        allSandboxes2.size() == 2 && allCreatedSandboxes2.size() == 1 && allStartedSandboxes2.size() == 1
        allStartedSandboxes2.first().containerId == A_CONTAINER_ID_2
        allStartedSandboxes2.first().sandboxId == newId
        allSandboxes.first().sandboxId == sandboxId
        allStartedSandboxes2.first().username == A_USERNAME_2
        allStartedSandboxes2.first().uri == A_URI_2
    }

    def 'Asking for an alive sandbox for a certain user works as expected'(){
        given:
        def userSandboxes = repository.getUserRunningSandbox(A_USERNAME)
        when:
        repository.alive(sandboxId)
        def userAliveSandboxes = repository.getUserRunningSandbox(A_USERNAME)
        then:
        !userSandboxes && userAliveSandboxes && userAliveSandboxes.status == ALIVE
    }

    def private create( username = A_USERNAME, containerId = A_CONTAINER_ID) { repository.created(username,containerId) }


}
