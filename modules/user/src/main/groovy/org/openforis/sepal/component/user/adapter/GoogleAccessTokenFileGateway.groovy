package org.openforis.sepal.component.user.adapter

import groovy.json.JsonOutput
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.util.Terminal
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path

interface GoogleAccessTokenFileGateway {

    void save(String username, GoogleTokens tokens)

    void delete(String username)

    File credentialsFile(String username)
}

class GoogleAccessTokenFileGatewayImpl implements GoogleAccessTokenFileGateway {
    private final Logger LOG = LoggerFactory.getLogger(GoogleAccessTokenFileGatewayImpl)
    private final String homeDirectory

    GoogleAccessTokenFileGatewayImpl(String homeDirectory) {
        this.homeDirectory = homeDirectory
    }

    void save(String username, GoogleTokens tokens) {
        if (!tokens) {
            LOG.info("Deleting token file for user $username")
            delete(username)
            return
        }
        LOG.info("Saving token file for user $username. Expiration: $tokens.accessTokenExpiryDate")
        def file = credentialsFile(username)
        if (!file.exists()) {
            file.parentFile.mkdirs()
            file.createNewFile()
        }
        def lockFile = new File("${file.parent}/.lock")
        if (!lockFile.exists())
            lockFile.createNewFile()
        file.write(JsonOutput.toJson([
                access_token            : tokens.accessToken,
                access_token_expiry_date: tokens.accessTokenExpiryDate
        ]))
        def gid = Files.getAttribute(Path.of(homeDirectory, username), 'unix:gid', LinkOption.NOFOLLOW_LINKS)
        Terminal.execute(file.parentFile.parentFile, 'sudo', 'chown', "root:$gid", '.')
        Terminal.execute(file.parentFile.parentFile, 'sudo', 'chmod', "1775", '.')
        Terminal.execute(file.parentFile, 'sudo', 'chown', "root:$gid", '.')
        Terminal.execute(file.parentFile, 'sudo', 'chmod', "1775", '.')
        Terminal.execute(file, 'sudo', 'chown', "root:$gid", '.')
        Terminal.execute(lockFile, 'sudo', 'chown', "root:$gid", '.')
    }

    void delete(String username) {
        credentialsFile(username).delete()
    }

    File credentialsFile(String username) {
        new File("$homeDirectory/$username/.config/earthengine/", 'credentials')
    }

}
