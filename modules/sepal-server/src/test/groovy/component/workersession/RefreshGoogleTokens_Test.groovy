package component.workersession

import org.openforis.sepal.command.ExecutionFailed

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.CLOSED

class RefreshGoogleTokens_Test extends AbstractWorkerSessionTest {
    def 'Given an active session, when refreshing google tokens, session user tokens are refreshed'() {
        def session = activeSession()

        when:
        refreshGoogleTokens()

        then:
        googleOAuthGateway.tokensRefreshed(session.username)
    }

    def 'Given user with two active sessions, when refreshing google tokens, session user tokens are refreshed once'() {
        def session = activeSession()
        activeSession()

        when:
        refreshGoogleTokens()

        then:
        googleOAuthGateway.tokensRefreshCount(session.username) == 1
    }

    def 'Given two users with active sessions, when refreshing google tokens, both users tokens are refreshed'() {
        def session1 = activeSession(username: 'user1')
        def session2 = activeSession(username: 'user2')

        when:
        refreshGoogleTokens()

        then:
        googleOAuthGateway.tokensRefreshCount('user1') == 1
        googleOAuthGateway.tokensRefreshCount('user2') == 1
    }

    def 'Given a pending session, when refreshing google tokens, session user tokens are refreshed'() {
        def session = pendingSession()

        when:
        refreshGoogleTokens()

        then:
        googleOAuthGateway.tokensRefreshed(session.username)
    }

    def 'Given a closed session, when refreshing google tokens, session user tokens are not refreshed'() {
        def session = closedSession()

        when:
        refreshGoogleTokens()

        then:
        !googleOAuthGateway.tokensRefreshed(session.username)
    }
}
