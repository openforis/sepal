package integration.database

import endtoend.SepalDriver
import org.openforis.sepal.user.JDBCUserRepository
import org.openforis.sepal.user.UserRepository
import spock.lang.Ignore
import spock.lang.Shared
import spock.lang.Specification


class UserRepositoryTest extends Specification {

    private def static USERNAME = "Test.User"
    private def static UID = 12356

    @Shared SepalDriver sepalDriver
    @Shared UserRepository userRepo

    def setupSpec() {
        sepalDriver = new SepalDriver()
        sepalDriver.withUser(USERNAME, UID)

        userRepo = new JDBCUserRepository(sepalDriver.getSQLManager())
    }

    def cleanupSpec() {
        sepalDriver.stop()
    }

    def 'query the user table with a given username, the user uid is returned properly'() {
        when:
            def uid = userRepo.getUserUid(USERNAME)
        then:
            uid == UID
    }

    def 'looking for an existing user, the .userExist method will return a positive response'() {
        when:
            def exist = userRepo.userExist(USERNAME)
            def doesNotExist = userRepo.userExist("Non.User")
        then:
            exist
            !doesNotExist
    }
}
