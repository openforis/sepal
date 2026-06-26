package component.workersession

import org.openforis.sepal.component.workersession.query.FindUsernameByApiKey

import static org.openforis.sepal.workertype.WorkerTypes.SANDBOX

class FindUsernameByApiKey_Test extends AbstractWorkerSessionTest {
    def 'Returns the username for a PENDING sandbox session'() {
        def session = requestSession(workerType: SANDBOX)

        when:
        def username = findUsernameByApiKey(session.apiKey)

        then:
        username == testUsername
    }

    def 'Returns the username for an ACTIVE sandbox session'() {
        def session = requestSession(workerType: SANDBOX)
        instanceManager.activate(session.instance.id)

        when:
        def username = findUsernameByApiKey(session.apiKey)

        then:
        username == testUsername
    }

    def 'Returns null once the session is closed (api key cleared in the DB)'() {
        def session = requestSession(workerType: SANDBOX)
        def apiKey = session.apiKey
        closeSession(session)

        when:
        def username = findUsernameByApiKey(apiKey)

        then:
        username == null
    }

    def 'Returns null for an unknown api key'() {
        requestSession(workerType: SANDBOX)

        when:
        def username = findUsernameByApiKey('does-not-exist')

        then:
        username == null
    }

    def 'Returns null for a null api key'() {
        requestSession(workerType: SANDBOX)

        when:
        def username = findUsernameByApiKey(null)

        then:
        username == null
    }

    def 'Returns null for an empty api key'() {
        requestSession(workerType: SANDBOX)

        when:
        def username = findUsernameByApiKey('')

        then:
        username == null
    }

    private String findUsernameByApiKey(String apiKey) {
        component.submit(new FindUsernameByApiKey(apiKey: apiKey))
    }
}
