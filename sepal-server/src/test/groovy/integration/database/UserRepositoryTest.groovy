package integration.database

import endtoend.SepalDriver
import org.openforis.sepal.user.JDBCUserRepository
import org.openforis.sepal.user.NonExistingUser
import org.openforis.sepal.user.UserRepository
import spock.lang.Shared
import spock.lang.Specification

class UserRepositoryTest extends Specification {
    static USERNAME = "Test.User"
    static UID = 12356

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
            def usr = userRepo.fetchUser(USERNAME)
        then:
            usr.userUid == UID
    }

    def 'looking for an existing user, the .fetchUser method will return a positive response'() {
        when:
            def exist = userRepo.fetchUser(USERNAME)
        then:
            exist
    }

    def 'looking for an  non existing user, the .fetchUser method will throw an exception'() {
        when:
        userRepo.fetchUser('NONexisting')
        then:
        thrown(NonExistingUser)
    }

    def 'checking the .getUser method works as expected'(){
        when:
        def usr1 = userRepo.getUser(USERNAME)
        def usr2 = userRepo.getUser('asd')
        then:
        usr1
        !usr2
    }
}
