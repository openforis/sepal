package unit.sandbox

import org.openforis.sepal.instance.*
import org.openforis.sepal.session.*
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.user.NonExistingUser
import org.openforis.sepal.user.UserRepository
import spock.lang.Ignore
import spock.lang.Specification

import static org.openforis.sepal.instance.Instance.Status.AVAILABLE
import static org.openforis.sepal.instance.Instance.Status.CREATED

@Ignore
class SandboxManagerTest extends Specification {

    SepalSessionManager sandboxManager
    SessionContainerProvider containersProvider
    SepalSessionRepository dataRepo
    UserRepository userRepo
    InstanceManager instanceManager

    def setup() {

        userRepo = Stub(UserRepository)
        containersProvider = Spy(DockerContainersProvider, constructorArgs: [null, null])
        dataRepo = Spy(JDBCSepalSessionRepository, constructorArgs: null)
        instanceManager = Spy(ConcreteInstanceManager, constructorArgs: [
                null as InstanceDataRepository, null as DataCenter, 'commitStage']
        )

        sandboxManager = new ConcreteSepalSessionManager(containersProvider, dataRepo, userRepo, instanceManager)

    }

    def 'checking whether the getUserSandbox user check as expected'() {
        given:
        userRepo.userExist(_) >> false
        when:
        sandboxManager.getUserSandbox('A_USER')
        then:
        thrown(NonExistingUser)
    }

    def 'checking whether getUserSandbox() method behaves correctly'() {
        given:
        userRepo.userExist(_) >> true
        when:
        def case1 = sandboxManager.getUserSandbox('A_USER')
        def case2 = sandboxManager.getUserSandbox('A_USER')
        then:
        2 * dataRepo.getUserSandbox(_) >>> [null]
        2 * instanceManager.reserveSlot(_, _) >>> [new Instance(status: CREATED), new Instance(status: AVAILABLE)]
        2 * dataRepo.requested(_, _, _) >>> [1L]
        1 * containersProvider.obtain(_, _) >>> [new SepalSession()]
        1 * dataRepo.created(_, _, _) >> {}
    }


}





