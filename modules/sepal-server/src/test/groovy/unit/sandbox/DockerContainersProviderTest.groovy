package unit.sandbox

import org.openforis.sepal.session.docker.DockerClient
import org.openforis.sepal.session.docker.DockerSessionContainerProvider
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.user.UserRepository
import spock.lang.Specification

class DockerContainersProviderTest extends Specification {
    static A_CONTAINER_ID = "A_CONTAINER_ID"
    static ANOTHER_CONTAINER_ID = "A_CONTAINER_ID2"

    def 'The release method behaves correctly both when asked to release running or terminated containers'() {
        given:
        def userRepository = Mock(UserRepository)

        def dockerClient = Stub(DockerClient) {
            isContainerRunning(_ as SepalSession) >>> [false, true]
            releaseContainer(_ as SepalSession) >> true
        }

        def dockerContainersProvider = new DockerSessionContainerProvider(dockerClient, userRepository)
        when:
        def released = dockerContainersProvider.release(new SepalSession(containerId: A_CONTAINER_ID))
        def released2 = dockerContainersProvider.release(new SepalSession(containerId: ANOTHER_CONTAINER_ID))
        then:
        !released
        released2
    }
}
