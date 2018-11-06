package component.workersession

import org.openforis.sepal.component.workersession.api.GoogleOAuthGateway

class FakeGoogleOAuthGateway implements GoogleOAuthGateway {
    private final List refreshedUsernames = []

    void refreshTokens(String username) {
        refreshedUsernames << username
    }

    boolean tokensRefreshed(String username) {
        return username in refreshedUsernames
    }

    int tokensRefreshCount(String username) {
        return refreshedUsernames.count { it == username}
    }
}
