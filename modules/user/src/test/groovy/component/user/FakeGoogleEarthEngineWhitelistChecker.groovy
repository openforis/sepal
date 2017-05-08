package component.user

import org.openforis.sepal.component.user.api.GoogleEarthEngineWhitelistChecker
import org.openforis.sepal.user.GoogleTokens

class FakeGoogleEarthEngineWhitelistChecker implements GoogleEarthEngineWhitelistChecker {
    private boolean whitelisted = true

    boolean isWhitelisted(String username, GoogleTokens tokens) {
        return whitelisted
    }

    void notWhiteListed() {
        this.whitelisted = false
    }
}
