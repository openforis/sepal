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
                response.contentType = 'application/json'

                if (params.password == 'demo')
                    send toJson(authenticator.users.values().first())
                else
                    halt(401)
            }


            get('/data/sceneareas') {
                response.contentType = 'application/json'

                params.countryIso
//                params.polygon

                // coordinates:[lat , long ]
                send toJson([
                        [
                                sceneAreaId           : '192_45'
                                , lowerLeftCoordinate : [43.95287, -73.38717]
                                , upperLeftCoordinate : [45.66895, -72.81323]
                                , upperRightCoordinate: [45.24376, -70.44335]
                                , lowerRightCoordinate: [43.53155, -71.0851]
                        ]
                ])
            }

            get('/data/sceneareas/{sceneAreaId}') {
                response.contentType = 'application/json'

                params.targetDay //MM-dd
                params.startDate //YYYY-MM-dd
                params.endDate  //YYYY-MM-dd

                send toJson([
                        [
                                sceneId        : 'LC80130292014100LGN00',
                                sensor         : "L8",
                                browseUrl      : 'http://',
                                acquisitionDate: '2014-04-10',
                                sunAzimuth     : 149.68956135,
                                cloudCover     : 12.3,
                                score          : "0.1"

                        ]
                ])
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
