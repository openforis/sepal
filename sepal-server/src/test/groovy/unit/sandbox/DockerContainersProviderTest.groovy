package unit.sandbox

import org.openforis.sepal.sandbox.DockerClient
import org.openforis.sepal.sandbox.DockerContainersProvider
import org.openforis.sepal.user.UserRepository
import spock.lang.Specification

class DockerContainersProviderTest extends Specification{

    private static A_CONTAINER_ID = "A_CONTAINER_ID"
    private static ANOTHER_CONTAINER_ID = "A_CONTAINER_ID2"


    def 'The release method behaves correctly both when asked to release running or terminated containers'(){
        given:
        def userRepository = Mock(UserRepository)

        def dockerClient = Stub(DockerClient) {
            isContainerRunning(A_CONTAINER_ID) >> false
            isContainerRunning(ANOTHER_CONTAINER_ID) >> true
            releaseContainer(_ as String) >> true

        }

        def dockerContainersProvider = new DockerContainersProvider(dockerClient,userRepository)
        when:
        def released = dockerContainersProvider.release(A_CONTAINER_ID)
        def released2 = dockerContainersProvider.release(ANOTHER_CONTAINER_ID)
        then:
        !released
        released2
    }
}
