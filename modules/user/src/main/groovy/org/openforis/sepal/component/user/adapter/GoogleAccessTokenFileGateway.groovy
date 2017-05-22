package org.openforis.sepal.component.user.adapter

class GoogleAccessTokenFileGateway {
    private final String homeDirectory

    GoogleAccessTokenFileGateway(String homeDirectory) {
        this.homeDirectory = homeDirectory
    }

    void save(String username, String accessToken) {
        if (!accessToken) {
            delete(username)
            return
        }
        def file = new File("$homeDirectory/$username", '.google-access-token')
        if (!file.exists()) {
            file.parentFile.mkdirs()
            file.createNewFile()
        }
        file.write(accessToken)
    }

    void delete(String username) {
        new File("$homeDirectory/$username", '.google-access-token').delete()
    }

}
