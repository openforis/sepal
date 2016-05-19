package org.openforis.sepal.security

import groovymvc.Controller
import org.openforis.sepal.endpoint.EndpointRegistry

class GateOneAuthEndpoint implements EndpointRegistry {
    private final String publicKey
    private final String privateKey

    GateOneAuthEndpoint(String publicKey, String privateKey) {
        this.privateKey = privateKey
        this.publicKey = publicKey
    }

    void registerEndpointsWith(Controller controller) {
        controller.with {
            get('/gateone/auth-object') {
                response.contentType = 'application/json'
                send new GateOneAuthObject(
                        publicKey: publicKey,
                        privateKey: privateKey,
                        username: currentUser.username,
                        timestamp: System.currentTimeMillis()
                ).toJson()
            }
        }
    }
}