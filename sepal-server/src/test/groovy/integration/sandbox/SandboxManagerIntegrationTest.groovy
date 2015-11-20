package integration.sandbox

import endtoend.SepalDriver
import org.openforis.sepal.instance.InstanceManager
import org.openforis.sepal.sandbox.*
import org.openforis.sepal.user.JDBCUserRepository
import org.openforis.sepal.user.UserRepository
import spock.lang.Ignore
import spock.lang.Shared
import spock.lang.Specification

import static org.openforis.sepal.sandbox.SandboxStatus.ALIVE

@Ignore
class SandboxManagerIntegrationTest extends Specification {
    def A_USERNAME = "Test.User"
    def ANOTHER_USERNAME = "Another.UserName"
    def YET_ANOTHER_USERNAME = "Alex.DelPiero"
    def A_CONTAINER_ID = "fff53fffeab"
    def ANOTHER_CONTAINER_ID = "00000000fedc"
    def A_URI = "http://some.uri.io"

    @Shared SepalDriver driver

    SandboxManager sandboxManager
    SandboxDataRepository sandboxDataRepository
    UserRepository userRepository
    SandboxContainersProvider containersProvider
    InstanceManager instanceManager

    def sandboxId


    def setupSpec() {
        driver = new SepalDriver()
    }

    def cleanupSpec() {
        driver.stop()
    }

    def cleanup() {
        driver.resetDatabase()
    }

    def setup() {

        driver.withUser(YET_ANOTHER_USERNAME, 101)
        driver.withUser(ANOTHER_USERNAME, 101)
        driver.withUser(A_USERNAME, 101)

        def stubDockerClient = Spy(DockerClient) {
            isContainerRunning({SandboxData data -> data.containerId == A_CONTAINER_ID}) >> true
            isContainerRunning({SandboxData data -> data.containerId == ANOTHER_CONTAINER_ID}) >> false
            createContainer(YET_ANOTHER_USERNAME, 101,_) >> new SandboxData(uri: A_URI, containerId: A_CONTAINER_ID)
            createContainer(ANOTHER_USERNAME, 101,_) >> new SandboxData(uri: A_URI, containerId: A_CONTAINER_ID)
        }



        userRepository = Spy(JDBCUserRepository, constructorArgs: [driver.getSQLManager()])
        sandboxDataRepository = Spy(JDBCSandboxDataRepository, constructorArgs: [driver.getSQLManager()])
        containersProvider = Spy(DockerContainersProvider, constructorArgs: [stubDockerClient, userRepository])
        sandboxManager = new ConcreteSandboxManager(containersProvider, sandboxDataRepository, userRepository,instanceManager)

        sandboxId = sandboxDataRepository.requested(A_USERNAME)
        sandboxDataRepository.created(sandboxId, A_CONTAINER_ID, A_URI)
    }

    def 'given an existing sandbox registered on the database, the sandboxmanager behaves as expected'() {
        when:
            def sandboxData = sandboxManager.getUserSandbox(A_USERNAME)
        then:
            1 * containersProvider.isRunning(_)
            0 * containersProvider.obtain(A_USERNAME,_)
            sandboxData.sandboxId == sandboxId
            sandboxData.containerId == A_CONTAINER_ID
            sandboxData.status == ALIVE
    }

    def 'given no existing sandbox for a given user on the database, the sandboxmanager behaves as expected'() {
        when:
            sandboxManager.getUserSandbox(ANOTHER_USERNAME)
        then:
            0 * containersProvider.isRunning(_)
            1 * containersProvider.obtain(ANOTHER_USERNAME,_)
            1 * sandboxDataRepository.requested(ANOTHER_USERNAME)
            1 * sandboxDataRepository.created(_, _, _)
            def userSandbox = sandboxDataRepository.getUserSandbox(ANOTHER_USERNAME)
            userSandbox
            userSandbox.status == ALIVE
            userSandbox.username == ANOTHER_USERNAME
            userSandbox.containerId == A_CONTAINER_ID
    }

    def 'given stale data on the database, the sandbox manager behaves correctly'() {
        given:
            def sandboxId = sandboxDataRepository.requested(YET_ANOTHER_USERNAME)
            sandboxDataRepository.created(sandboxId, ANOTHER_CONTAINER_ID, A_URI)
        when:
            sandboxManager.getUserSandbox(YET_ANOTHER_USERNAME)
        then:
            containersProvider.isRunning(ANOTHER_CONTAINER_ID) >> false
            1 * sandboxDataRepository.terminated(sandboxId)
            1 * containersProvider.obtain(YET_ANOTHER_USERNAME)
            1 * sandboxDataRepository.created(_ ,A_CONTAINER_ID, A_URI)
            def sandboxData2 = sandboxManager.getUserSandbox(YET_ANOTHER_USERNAME)
            !(sandboxId == sandboxData2.sandboxId)

    }


}
