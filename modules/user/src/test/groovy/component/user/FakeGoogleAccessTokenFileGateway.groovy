package component.user

import groovy.json.JsonOutput
import org.openforis.sepal.component.user.adapter.GoogleAccessTokenFileGateway
import org.openforis.sepal.user.GoogleTokens

class FakeGoogleAccessTokenFileGateway implements GoogleAccessTokenFileGateway{
    private final String homeDirectory

    FakeGoogleAccessTokenFileGateway(String homeDirectory) {
        this.homeDirectory = homeDirectory
    }

    void save(String username, GoogleTokens tokens) {
        if (!tokens) {
            delete(username)
            return
        }
        def file = credentialsFile(username)
        if (!file.exists()) {
            file.parentFile.mkdirs()
            file.createNewFile()
        }
        file.write(JsonOutput.toJson([
                access_token            : tokens.accessToken,
                access_token_expiry_date: tokens.accessTokenExpiryDate
        ]))
    }

    void delete(String username) {
        credentialsFile(username).delete()
    }

    File credentialsFile(String username) {
        new File("$homeDirectory/$username/.config/earthengine/", 'credentials')
    }
}
