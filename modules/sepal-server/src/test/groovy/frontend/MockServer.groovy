package frontend

import groovymvc.security.BasicRequestAuthenticator
import groovymvc.security.PathRestrictions
import groovymvc.security.UsernamePasswordVerifier
import org.omg.PortableInterceptor.USER_EXCEPTION
import org.openforis.sepal.security.LdapUsernamePasswordVerifier
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.user.JdbcUserRepository
import org.openforis.sepal.user.User
import org.openforis.sepal.user.UserRepository

import static groovy.json.JsonOutput.toJson
import groovymvc.AbstractMvcFilter
import groovymvc.Controller

import javax.servlet.ServletContext

import org.openforis.sepal.Server
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class MockServer extends AbstractMvcFilter {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    Controller bootstrap(ServletContext servletContext) {
        def authenticator = new FakeAuthenticator()
        def controller = Controller.builder(servletContext)
                .build()

        controller.with {
            post('/login') {
                if (params.password == 'demo')
                    send toJson(authenticator.users.values().first())
                else
                    halt(401)
            }
            get('/foo/{name}') {

                LOG.info("adasdasdfasfas")

                response.contentType = 'application/json'
                send toJson(
                        foo: params.name,
                        bar: params
                )
            }

        }
        return controller
    }

    static void main(String[] args) {
        new Server().deploy(this, 9999)
    }

}
