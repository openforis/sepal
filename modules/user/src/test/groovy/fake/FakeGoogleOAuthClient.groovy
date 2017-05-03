package fake

import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.user.GoogleTokens

class FakeGoogleOAuthClient implements GoogleOAuthClient {
    private URI redirectUri = URI.create('http://some-redirect-uri')
    GoogleTokens tokens = createTokens()
    private final Set revokedTokens = new HashSet()
    private final Set refreshedTokens = new HashSet()

    URI redirectUrl(String destinationUrl) {
        return redirectUri
    }

    GoogleTokens requestTokens(String authorizationCode) {
        return tokens
    }

    GoogleTokens refreshAccessToken(GoogleTokens tokens) {
        refreshedTokens << tokens
        def refreshed = new GoogleTokens(
                tokens.refreshToken, UUID.randomUUID() as String, tokens.accessTokenExpiryDate + 1)
        this.tokens = refreshed
        return refreshed
    }

    void revokeTokens(GoogleTokens tokens) {
        revokedTokens << tokens
        this.tokens = null
    }

    void setRedirectUri(URI redirectUri) {
        this.redirectUri = redirectUri
    }

    boolean revoked(GoogleTokens tokens) {
        tokens in revokedTokens
    }

    boolean refreshed(GoogleTokens tokens) {
        tokens in refreshedTokens
    }

    private GoogleTokens createTokens() {
        new GoogleTokens(UUID.randomUUID() as String, UUID.randomUUID() as String, new Date() + 1)
    }
}
