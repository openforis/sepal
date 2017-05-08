package component.workersession

import org.openforis.sepal.component.workersession.api.GoogleOAuthGateway

class FakeGoogleOAuthGateway implements GoogleOAuthGateway {
    private final Set refreshedUsernames = new HashSet()

    void refreshTokens(String username) {
        refreshedUsernames << username
    }

    boolean tokensRefreshed(String username) {
        return username in refreshedUsernames
    }
}
