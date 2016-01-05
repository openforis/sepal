package integration.database

import endtoend.SepalDriver
import org.openforis.sepal.instance.DataCenter
import org.openforis.sepal.instance.Instance
import org.openforis.sepal.instance.InstanceProvider
import org.openforis.sepal.session.JDBCSepalSessionRepository
import spock.lang.Ignore
import spock.lang.Shared
import spock.lang.Specification

import static org.openforis.sepal.session.model.SessionStatus.ALIVE
import static org.openforis.sepal.session.model.SessionStatus.TERMINATED


@Ignore
class SandboxDataRepositoryTest extends Specification {
    static final A_USERNAME = "A_USERNAME"
    static final A_USERNAME_2 = "A_USERNAME_2"
    static final A_CONTAINER_ID = "A_CONTAINER_ID"
    static final A_CONTAINER_ID_2 = "A_CONTAINER_ID_2"
    static final A_URI_2 = "A_URI_2"
    static final A_URI = "A_URI"
    static final A_INSTANCE_PROVIDER = "A_INSTANCE_PROVIDER"
    static final A_INSTANCE = "A_INSTANCE"
    static final A_DATA_CENTER = "A_DATA_CENTER"

    @Shared SepalDriver driver
    int sandboxId
    InstanceProvider ip
    DataCenter dc
    Instance instance
    JDBCSepalSessionRepository repository

    def setupSpec() {
        driver = new SepalDriver()

    }

    def cleanupSpec() {
        driver?.stop()
    }

    def cleanup() {
        driver.resetDatabase()
    }

    def setup() {
        repository = new JDBCSepalSessionRepository(driver.getSQLManager())
        ip = new InstanceProvider(name: A_INSTANCE_PROVIDER)
        driver.withInstanceProvider(ip)
        dc = new DataCenter(name: A_DATA_CENTER, provider: ip)
        driver.withDataCenter(dc)
        instance = new Instance(name: A_INSTANCE, dataCenter: dc)
        driver.withInstance(instance)
        sandboxId = create()
    }

    def 'notifying the database that a sandbox has been requested works as expected'() {
        when:
        def sandboxId = repository.requested(A_USERNAME_2, instance.id, SMALL)
        def sandboxId2 = repository.requested(A_USERNAME_2, instance.id, MEDIUM)
        repository.created(sandboxId, A_CONTAINER_ID, A_URI)
        repository.created(sandboxId2, A_CONTAINER_ID, A_URI)
        then:
        def sandboxData = repository.getUserSandbox(A_USERNAME_2, SMALL)
        def sandboxData2 = repository.getUserSandbox(A_USERNAME_2, LARGE)
        def sandboxData3 = repository.getUserSandbox(A_USERNAME_2, MEDIUM)
        sandboxData && sandboxData.sandboxId == sandboxId
        !sandboxData2
        sandboxData3 && sandboxData3.sandboxId == sandboxId2

    }

    def 'trying to store alive signal for an non existent sandbox fail'() {
        when:
        def stored = repository.alive(new Random().nextInt())
        then:
        !stored
    }

    def 'storing alive signal works as expected'() {
        when:
        def updated = repository.alive(sandboxId)
        def sandboxes = repository.getSandboxes(ALIVE)
        then:
        updated
        sandboxes.first().status == ALIVE
    }

    def 'notifying the database that a sandbox has been terminated works as expected'() {
        when:
        repository.terminated(sandboxId)
        def sandboxes = repository.getSandboxes(TERMINATED)
        then:
        sandboxes
        sandboxes.first().status == TERMINATED
    }

    def 'notifying the database that a sandbox has been created works as expected'() {
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


    def 'performing queries over the table containing sandboxes info works as expected'() {
        given:
        def allSandboxes = repository.getSandboxes()
        def allStartedSandboxes = repository.getSandboxes(ALIVE)
        def allTerminatedSanboxes = repository.getSandboxes(TERMINATED)
        when:
        int newId = create(A_USERNAME_2, A_CONTAINER_ID_2, A_URI_2)
        repository.terminated(newId)
        def allSandboxes2 = repository.getSandboxes()
        def allTerminatedSanboxes2 = repository.getSandboxes(TERMINATED)
        def allStartedSandboxes2 = repository.getSandboxes(ALIVE)
        then:
        allSandboxes && allStartedSandboxes && !allTerminatedSanboxes && allSandboxes.first().instance.id == 1
        allSandboxes2 && allStartedSandboxes2 && allTerminatedSanboxes2
        allSandboxes.size() == 1 && allStartedSandboxes.size() == 1
        allSandboxes2.size() == 2 && allStartedSandboxes.size() == 1 && allTerminatedSanboxes2.size() == 1
        allTerminatedSanboxes2.first().containerId == A_CONTAINER_ID_2
        allTerminatedSanboxes2.first().sandboxId == newId
        allSandboxes.first().sandboxId == sandboxId
        allTerminatedSanboxes2.first().username == A_USERNAME_2
        allTerminatedSanboxes2.first().uri == A_URI_2
    }

    def 'Asking for an alive sandbox for a certain user works as expected'() {
        given:
        def userSandboxes = repository.getUserSandbox(A_USERNAME_2)
        when:
        repository.alive(sandboxId)
        def userAliveSandboxes = repository.getUserSandbox(A_USERNAME)
        then:
        !userSandboxes && userAliveSandboxes && userAliveSandboxes.status == ALIVE
    }

    def private create(username = A_USERNAME, containerId = A_CONTAINER_ID, uri = A_URI, size = SMALL) {
        def sandboxId = repository.requested(username, instance.id, size)
        repository.created(sandboxId, containerId, uri)
        return sandboxId
    }


}
