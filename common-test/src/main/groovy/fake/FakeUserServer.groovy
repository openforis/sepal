package fake

import fake.server.TestServer
import groovymvc.Controller
import org.openforis.sepal.user.User

import static groovy.json.JsonOutput.toJson

class FakeUserServer extends TestServer {
    final String validUsername = 'valid_username'
    final String validPassword = 'valid_password'

    void register(Controller controller) {
        controller.with {
            post('authenticate') {
                if (params.username == validUsername && params.password == validPassword) {
                    response.status = 200
                    response.contentType = 'application/json'
                    send toJson(new User(username: params.username))
                } else
                    response.status = 401
            }

            get('user') {
                throw new UnsupportedOperationException('Not implemented on fake')
            }

            get('users') {
                throw new UnsupportedOperationException('Not implemented on fake')
            }

            post('users') {
                throw new UnsupportedOperationException('Not implemented on fake')
            }
        }
    }
}
