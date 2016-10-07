package org.openforis.sepal.user

import groovyx.net.http.RESTClient
import org.openforis.sepal.security.Roles

import static groovyx.net.http.ContentType.JSON

interface UserRepository {
    void eachUsername(Closure closure)
}

class RestUserRepository implements UserRepository {
    private final String endpoint
    private final String username

    RestUserRepository(String endpoint, String username) {
        this.username = username
        this.endpoint = endpoint
    }

    void eachUsername(Closure closure) {
        def response = http.get(
                path: 'list',
                contentType: JSON,
                requestContentType: JSON,
                headers: ['sepal-user': new User(username: username, roles: [Roles.ADMIN]).jsonString()])
        response.data.each {
            closure.call(it.username)
        }
    }

    private RESTClient getHttp() {
        def client = new RESTClient(endpoint)
        return client
    }
}

