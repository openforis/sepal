package fake

import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.user.GoogleTokens

class FakeGoogleOAuthClient implements GoogleOAuthClient {
    private URI redirectUri = URI.create('http://some-redirect-uri')
    GoogleTokens tokens = createTokens()
    private final Set revokedTokens = new HashSet()
    private final Set refreshedTokens = new HashSet()
    private Exception failWith

    URI redirectUrl(String destinationUrl) {
        if (failWith)
            throw failWith
        return redirectUri
    }

    GoogleTokens requestTokens(String username, String authorizationCode) {
        if (failWith)
            throw failWith
        return tokens
    }

    GoogleTokens refreshAccessToken(String username, GoogleTokens tokens) {
        if (failWith)
            throw failWith
        refreshedTokens << tokens
        def refreshed = new GoogleTokens(
                tokens.refreshToken, UUID.randomUUID() as String, tokens.accessTokenExpiryDate + 1)
        this.tokens = refreshed
        return refreshed
    }

    void revokeTokens(String username, GoogleTokens tokens) {
        if (failWith)
            throw failWith
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

    void failWith(Exception e) {
        failWith = e
    }

    private GoogleTokens createTokens() {
        new GoogleTokens(UUID.randomUUID() as String, UUID.randomUUID() as String, System.currentTimeMillis() + 60 * 1000)
    }


}
