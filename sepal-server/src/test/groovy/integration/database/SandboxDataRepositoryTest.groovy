package integration.database

import endtoend.SepalDriver
import org.openforis.sepal.sandbox.JDBCSandboxDataRepository
import spock.lang.Shared
import spock.lang.Specification

import static org.openforis.sepal.sandbox.SandboxStatus.ALIVE
import static org.openforis.sepal.sandbox.SandboxStatus.TERMINATED

class SandboxDataRepositoryTest extends Specification{

    private static final A_USERNAME = "A_USERNAME"
    private static final A_USERNAME_2 = "A_USERNAME_2"
    private static final A_CONTAINER_ID = "A_CONTAINER_ID"
    private static final A_CONTAINER_ID_2 = "A_CONTAINER_ID_2"
    private static final A_URI_2 = "A_URI_2"
    private static final A_URI = "A_URI"

    @Shared SepalDriver driver
    @Shared sandboxId
    JDBCSandboxDataRepository repository

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
        def sandboxes = repository.getSandboxes(ALIVE)
        then:
        sandboxes
        sandboxes.size() == 1
        sandboxes.first().status == ALIVE
        sandboxes.first().sandboxId == sandboxId
        sandboxes.first().containerId == A_CONTAINER_ID
        sandboxes.first().username == A_USERNAME
    }



    def 'performing queries over the table containing sandboxes info works as expected'(){
        given:
        def allSandboxes = repository.getSandboxes()
        def allStartedSandboxes = repository.getSandboxes(ALIVE)
        def allTerminatedSanboxes = repository.getSandboxes(TERMINATED)
        when:
        int newId = create(A_USERNAME_2,A_CONTAINER_ID_2,A_URI_2)
        repository.terminated(newId)
        def allSandboxes2 = repository.getSandboxes()
        def allTerminatedSanboxes2 = repository.getSandboxes(TERMINATED)
        def allStartedSandboxes2 = repository.getSandboxes(ALIVE)
        then:
        allSandboxes && allStartedSandboxes && !allTerminatedSanboxes
        allSandboxes2 && allStartedSandboxes2 && allTerminatedSanboxes2
        allSandboxes.size() == 1 && allStartedSandboxes.size() == 1
        allSandboxes2.size() == 2 && allStartedSandboxes.size() == 1 && allTerminatedSanboxes2.size() == 1
        allTerminatedSanboxes2.first().containerId == A_CONTAINER_ID_2
        allTerminatedSanboxes2.first().sandboxId == newId
        allSandboxes.first().sandboxId == sandboxId
        allTerminatedSanboxes2.first().username == A_USERNAME_2
        allTerminatedSanboxes2.first().uri == A_URI_2
    }

    def 'Asking for an alive sandbox for a certain user works as expected'(){
        given:
        def userSandboxes = repository.getUserRunningSandbox(A_USERNAME_2)
        when:
        repository.alive(sandboxId)
        def userAliveSandboxes = repository.getUserRunningSandbox(A_USERNAME)
        then:
        !userSandboxes && userAliveSandboxes && userAliveSandboxes.status == ALIVE
    }

    def private create( username = A_USERNAME, containerId = A_CONTAINER_ID, uri = A_URI) { repository.created(username,containerId, uri) }


}
