package frontend

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import org.openforis.sepal.Server
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson

class MockServer extends AbstractMvcFilter {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final bounds = new Wrs2Bounds()

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
                def sceneAreas = bounds.forSceneAreaIds([
                        '187_32', '187_33', '187_34', '188_31', '188_32', '188_33', '188_34', '189_31', '189_32',
                        '189_34', '190_30', '190_31', '190_34', '191_29', '191_30', '191_31', '192_29', '192_30'])
                send toJson(sceneAreas)
            }


            get('/data/sceneareas/{sceneAreaId}') {
                response.contentType = 'application/json'

                params.targetDay //MM-dd
                params.startDate //YYYY-MM-dd
                params.endDate  //YYYY-MM-dd

                send toJson([
                        [sceneId: 'LC81900302015079LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015079LGN00.jpg', acquisitionDate: '2015-03-20', cloudCover: 0.08, sunAzimuth: 150.48942477, sunElevation: 42.80026465],
                        [sceneId: 'LC81900302015079LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015079LGN00.jpg', acquisitionDate: '2015-03-20', cloudCover: 0.08, sunAzimuth: 150.48942477, sunElevation: 42.80026465],
                        [sceneId: 'LE71900302015183NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015183NSG00.jpg', acquisitionDate: '2015-07-02', cloudCover: 0.09, sunAzimuth: 133.80200195, sunElevation: 63.82229996],
                        [sceneId: 'LE71900302015183NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015183NSG00.jpg', acquisitionDate: '2015-07-02', cloudCover: 0.09, sunAzimuth: 133.80200195, sunElevation: 63.82229996],
                        [sceneId: 'LE71900302015199NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015199NSG00.jpg', acquisitionDate: '2015-07-18', cloudCover: 0.1, sunAzimuth: 135.36825562, sunElevation: 61.8910408],
                        [sceneId: 'LE71900302015199NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015199NSG00.jpg', acquisitionDate: '2015-07-18', cloudCover: 0.1, sunAzimuth: 135.36825562, sunElevation: 61.8910408],
                        [sceneId: 'LE71900302016106NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016106NSG00.jpg', acquisitionDate: '2016-04-15', cloudCover: 0.34, sunAzimuth: 148.4969635, sunElevation: 53.07840347],
                        [sceneId: 'LE71900302016106NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016106NSG00.jpg', acquisitionDate: '2016-04-15', cloudCover: 0.34, sunAzimuth: 148.4969635, sunElevation: 53.07840347],
                        [sceneId: 'LE71900302015311NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015311NSG00.jpg', acquisitionDate: '2015-11-07', cloudCover: 0.47, sunAzimuth: 163.56713867, sunElevation: 29.02179146],
                        [sceneId: 'LE71900302015103NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015103NSG00.jpg', acquisitionDate: '2015-04-13', cloudCover: 0.47, sunAzimuth: 147.74519348, sunElevation: 51.80644989],
                        [sceneId: 'LE71900302015103NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015103NSG00.jpg', acquisitionDate: '2015-04-13', cloudCover: 0.47, sunAzimuth: 147.74519348, sunElevation: 51.80644989],
                        [sceneId: 'LE71900302015311NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015311NSG00.jpg', acquisitionDate: '2015-11-07', cloudCover: 0.47, sunAzimuth: 163.56713867, sunElevation: 29.02179146],
                        [sceneId: 'LE71900302016026NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016026NSG00.jpg', acquisitionDate: '2016-01-26', cloudCover: 1.02, sunAzimuth: 157.18023682, sunElevation: 24.84968567],
                        [sceneId: 'LE71900302016026NSG00', sensor: 'LE7', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016026NSG00.jpg', acquisitionDate: '2016-01-26', cloudCover: 1.02, sunAzimuth: 157.18023682, sunElevation: 24.84968567],
                        [sceneId: 'LC81900302015111LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015111LGN00.jpg', acquisitionDate: '2015-04-21', cloudCover: 1.4, sunAzimuth: 146.37338078, sunElevation: 54.70757449],
                        [sceneId: 'LC81900302015111LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015111LGN00.jpg', acquisitionDate: '2015-04-21', cloudCover: 1.4, sunAzimuth: 146.37338078, sunElevation: 54.70757449],
                        [sceneId: 'LC81900302015191LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015191LGN00.jpg', acquisitionDate: '2015-07-10', cloudCover: 1.76, sunAzimuth: 134.20303675, sunElevation: 62.96916492],
                        [sceneId: 'LC81900302015191LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015191LGN00.jpg', acquisitionDate: '2015-07-10', cloudCover: 1.76, sunAzimuth: 134.20303675, sunElevation: 62.96916492],
                        [sceneId: 'LC81900302015015LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015015LGN00.jpg', acquisitionDate: '2015-01-15', cloudCover: 1.85, sunAzimuth: 158.23985381, sunElevation: 22.88232301],
                        [sceneId: 'LC81900302015015LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015015LGN00.jpg', acquisitionDate: '2015-01-15', cloudCover: 1.85, sunAzimuth: 158.23985381, sunElevation: 22.88232301],
                        [sceneId: 'LC81900302015239LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015239LGN00.jpg', acquisitionDate: '2015-08-27', cloudCover: 2.28, sunAzimuth: 146.90510045, sunElevation: 52.77744787],
                        [sceneId: 'LC81900302015239LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015239LGN00.jpg', acquisitionDate: '2015-08-27', cloudCover: 2.28, sunAzimuth: 146.90510045, sunElevation: 52.77744787],
                        [sceneId: 'LC81900302015127LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015127LGN00.jpg', acquisitionDate: '2015-05-07', cloudCover: 2.78, sunAzimuth: 143.40108505, sunElevation: 59.2340895],
                        [sceneId: 'LC81900302015127LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015127LGN00.jpg', acquisitionDate: '2015-05-07', cloudCover: 2.78, sunAzimuth: 143.40108505, sunElevation: 59.2340895],
                        [sceneId: 'LC81900302016050LGN00', sensor: 'LC8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2016/190/030/LC81900302016050LGN00.jpg', acquisitionDate: '2016-02-19', cloudCover: 2.98, sunAzimuth: 153.68447136, sunElevation: 31.61607965]
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
