package endtoend.sandbox

import endtoend.FailedRequest
import endtoend.SepalDriver
import org.openforis.sepal.sandbox.SandboxStatus
import spock.lang.Ignore
import spock.lang.Shared
import spock.lang.Specification

@Ignore
class SanboxEndpointsTest extends Specification {
    static A_USER = "A.User"

    @Shared SepalDriver driver

    def setupSpec() {
        driver = new SepalDriver().withUser(A_USER, 101)

    }

    def cleanupSpec() {
        driver.stop()
    }

    def 'Asking sandbox for a non existing user throws exception'() {
        when:
            driver.getRequest("sandbox/non.user")
        then:
            def ex = thrown(FailedRequest)
            ex.response.status == 400
            ex.message.toLowerCase().contains('username')
    }


    def 'Endpoints replies as expected'() {

        when:
            def response = driver.getRequest("sandbox/$A_USER")
        then:
            def data = response.data
            data.username == A_USER
            def data2 = driver.getRequest("sandbox/$A_USER").data
            data2.username == data.username
            data.sandboxId == data2.sandboxId
            driver.postRequest("container/$data.sandboxId/alive")
            def data3 = driver.getRequest("sandbox/$A_USER").data
            data3.status == SandboxStatus.ALIVE.name()
            data3.sandboxId == data2.sandboxId
    }
}
