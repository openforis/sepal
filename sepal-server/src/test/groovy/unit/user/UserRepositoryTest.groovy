package unit.user

import endtoend.SepalDriver
import org.openforis.sepal.user.JDBCUserRepository
import spock.lang.Ignore
import spock.lang.Shared
import spock.lang.Specification


class UserRepositoryTest extends Specification {

    private static final A_USER = 'Test.User'
    private static final FAKE_SANDBOX_ID = 'FFF4FFFEACD'
    private static final FAKE_URI = 'http://some_fake_uri'
    @Shared private SepalDriver sepalDriver


    def setupSpec(){
        sepalDriver = new SepalDriver().withUsers(A_USER)
    }

    def cleanupSpec() {
        sepalDriver.stop()
    }

    def 'Saving a sandboxId on the table, when retrieving the user the data is available'() {
        def userRepo = new JDBCUserRepository(sepalDriver.getSQLManager())
        when:
            userRepo.update(A_USER, FAKE_SANDBOX_ID, FAKE_URI)
        then:
            userRepo.getSandboxId(A_USER) == FAKE_SANDBOX_ID
    }

    def 'Once the sanboxId is deleted, the query should return null'() {
        def userRepo = new JDBCUserRepository(sepalDriver.getSQLManager())
        when:
            userRepo.update(A_USER, FAKE_SANDBOX_ID, FAKE_URI)
        then:
            userRepo.getSandboxId(A_USER) == FAKE_SANDBOX_ID
            userRepo.update(A_USER, null, FAKE_URI)
            userRepo.getSandboxId(A_USER) == null

    }
}
