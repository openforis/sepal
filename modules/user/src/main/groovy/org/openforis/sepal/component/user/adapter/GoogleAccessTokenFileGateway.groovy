package org.openforis.sepal.component.user.adapter

import groovy.json.JsonOutput

class GoogleAccessTokenFileGateway {
    private final String homeDirectory

    GoogleAccessTokenFileGateway(String homeDirectory) {
        this.homeDirectory = homeDirectory
    }

    void save(String username, String refreshToken) {
        if (!refreshToken) {
            delete(username)
            return
        }
        def file = credentialsFile(username)
        if (!file.exists()) {
            file.parentFile.mkdirs()
            file.createNewFile()
        }
        file.write(JsonOutput.toJson([refresh_token: refreshToken]))
    }

    void delete(String username) {
        credentialsFile(username).delete()
    }

    private File credentialsFile(String username) {
        new File("$homeDirectory/$username/.config/earthengine/", 'credentials')
    }

}
