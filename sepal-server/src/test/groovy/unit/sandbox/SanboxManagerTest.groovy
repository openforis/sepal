package unit.sandbox

import org.openforis.sepal.sandbox.*
import org.openforis.sepal.user.UserRepository
import spock.lang.Shared
import spock.lang.Specification
import spock.util.concurrent.PollingConditions

import static org.openforis.sepal.sandbox.SandboxStatus.ALIVE
import static org.openforis.sepal.sandbox.SandboxStatus.CREATED
import static org.openforis.sepal.util.DateTime.add

class SanboxManagerTest extends Specification {
    static final A_SANDBOX_ID = 1
    static final A_SANDBOX2_ID = 2
    static final A_USERNAME = "A_USER"
    static final A_USERNAME2 = "A_USER2"
    static final A_CONTAINER_ID = "A_CONTAINER_ID"
    static final A_CONTAINER_ID_2 = "A_CONTAINER_ID2"

    @Shared SandboxData userSandbox
    @Shared SandboxData user2Sandbox
    @Shared SandboxData user3Sandbox

    SandboxManager sandboxManager
    StubContainersProvider containersprovider
    StubSandboxDataRepository dataRepository
    UserRepository userRepository

    def setupSpec() {
        def retroactive = add(new Date(), Calendar.SECOND, -5001)
        userSandbox = new SandboxData(
                sandboxId: A_SANDBOX_ID, statusRefreshedOn: new Date(), username: A_USERNAME, status: ALIVE, containerId: A_CONTAINER_ID)
        user2Sandbox = new SandboxData(
                sandboxId: A_SANDBOX2_ID, statusRefreshedOn: retroactive, username: A_USERNAME2, status: ALIVE, containerId: A_CONTAINER_ID_2)
        user3Sandbox = new SandboxData(
                sandboxId: A_SANDBOX2_ID, username: A_USERNAME2, status: CREATED, containerId: A_CONTAINER_ID_2)
    }


    def setup() {

        containersprovider = Spy(StubContainersProvider)
        dataRepository = Spy(StubSandboxDataRepository)
        dataRepository.add(A_USERNAME, userSandbox)
        dataRepository.add(A_USERNAME2, user2Sandbox)
        dataRepository.add(ALIVE, userSandbox, user2Sandbox)
        dataRepository.add(CREATED, user3Sandbox)

        userRepository = Stub(UserRepository) {
            userExist(_) >> true
        }

        sandboxManager = new ConcreteSandboxManager(containersprovider, dataRepository, userRepository)
    }


    def 'Checking whether the .aliveSignal method behaves correctly'() {
        when:
            sandboxManager.aliveSignal(A_SANDBOX_ID)
        then:
            1 * dataRepository.alive(A_SANDBOX_ID)
    }

    def 'Given a false positive running container, a new sandbox is allocated'() {
        when:
            sandboxManager.getUserSandbox(A_USERNAME)
        then:
            1 * dataRepository.getUserRunningSandbox(A_USERNAME)
            1 * containersprovider.isRunning(A_CONTAINER_ID)
            1 * dataRepository.terminated(A_SANDBOX_ID)
            1 * containersprovider.obtain(A_USERNAME)
    }

    def 'Given a running container, no new sandboxes are allocated'() {
        when:
            sandboxManager.getUserSandbox(A_USERNAME2)
        then:
            1 * dataRepository.getUserRunningSandbox(A_USERNAME2)
            containersprovider.isRunning(A_CONTAINER_ID_2) >> true
            0 * dataRepository.terminated(_)
            0 * containersprovider.obtain(A_USERNAME2)
    }

    def 'Given no running containers for a user, a new one is allocated'() {
        when:
            sandboxManager.getUserSandbox("SOME_RANDOM_USER")
        then:
            1 * dataRepository.getUserRunningSandbox(_)
            0 * containersprovider.isRunning(_)
            1 * dataRepository.created(_, _, _)
            1 * containersprovider.obtain(_)
    }

    def 'Checking whether the unused containers removal process works as expected'() {
        when:
            sandboxManager.start(5000, 5000)
        then:
            new PollingConditions(timeout: 6, initialDelay: 2).eventually {
                def terminatedContainers = dataRepository.terminated
                def releasedContainers = containersprovider.releasedContainers
                terminatedContainers
                releasedContainers
                terminatedContainers.size() == 1
                releasedContainers.size() == 1
                releasedContainers.first() == A_CONTAINER_ID_2
                terminatedContainers.first() == A_SANDBOX2_ID
            }
    }


    private class StubSandboxDataRepository implements SandboxDataRepository {

        Map<String, SandboxData> sandboxes = [:]
        Map<SandboxStatus, SandboxData[]> sandboxesByStatus = [:]

        List<Integer> terminatedInstances = []

        def add(String user, SandboxData sandbox) {
            sandboxes.put(user, sandbox)
        }

        def add(SandboxStatus status, SandboxData... data) {
            sandboxesByStatus.put(status, data)
        }


        Boolean alive(int sandboxId) {
            return null
        }

        void terminated(int sandboxId) {
            terminatedInstances.add(sandboxId)
        }

        List<Integer> getTerminated() {
            return terminatedInstances
        }

        @Override
        void created(int sandboxId, String containerId, String sandboxURI) {

        }

        @Override
        int requested(String username) {
            return 0
        }

        List<SandboxData> getSandboxes(SandboxStatus status) {
            return sandboxesByStatus.get(status)
        }

        SandboxData getUserRunningSandbox(String username) {
            return sandboxes.get(username)
        }
    }

    private class StubContainersProvider implements SandboxContainersProvider {

        List<String> releasedContainers = []

        SandboxData obtain(String username) {
            SandboxData sData = new SandboxData()
            sData.containerId = A_CONTAINER_ID
            return sData
        }

        Boolean isRunning(String containerId) {
            return containerId == A_CONTAINER_ID_2
        }

        List<String> getReleasedContainers() {
            return releasedContainers
        }

        Boolean release(String containerId) {
            releasedContainers.add(containerId)
        }
    }

}





