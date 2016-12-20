package frontend

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import groovymvc.ParamsException
import groovymvc.util.Decode
import org.openforis.sepal.endpoint.ResourceServer

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson
import static groovymvc.RequestContext.CURRENT_USER_SESSION_ATTRIBUTE

class MockServer extends AbstractMvcFilter {

    Controller bootstrap(ServletContext servletContext) {
        def authenticator = new FakeAuthenticator()
        def controller = Controller.builder(servletContext)
                .build()

        controller.with {
            def someUser = {
                authenticator.users.values().first()
            }

            error(ParamsException) {
                send(it.message)
                println "Bad request: $it.message"
                halt(400)
            }



            get('/api/user/files') {
                response.contentType = 'application/json'

                def homeDir = new File(System.getProperty("user.home"))
                def path = params.path
                def dir = new File(homeDir.absolutePath + path).canonicalFile
                def files = []
                dir.eachFile { file ->
                    files << [name: file.name, isDirectory: file.directory, size: file.size()]
                }
                send toJson(files)
            }

            get('/api/user/files/download') {
                def path = params.required('path', String)
                println "Downloading file at path $path"
            }

            delete('/api/sandbox/session/{sessionId}') {
                response.contentType = 'application/json'
                response.status = 200
                send toJson("[status:OK]")
            }


            get('/api/sandbox/report') {
                response.contentType = 'application/json'

                send toJson(
                        sessions: [[
                                           id               : 'some-session',
                                           path             : 'sandbox/session/some-session',
                                           username         : authenticator.users.values().first().username,
                                           status           : 'STARTING',
                                           host             : 'some-host',
                                           instanceType     : [
                                                   path       : "sandbox/instance-type/some-instance-type",
                                                   id         : 'some-instance-type',
                                                   name       : 'Some instance type',
                                                   description: 'Some instance type description',
                                                   hourlyCost : 0.1
                                           ],
                                           creationTime     : '2016-01-01T00:00:00',
                                           costSinceCreation: 0.1 * 2 * 24 // hourly cost * two days
                                   ]],
                        instanceTypes: [[
                                                path       : "sandbox/instance-type/some-instance-type",
                                                id         : 'some-instance-type',
                                                name       : 'Some instance type',
                                                description: 'Some instance type description',
                                                hourlyCost : 0.1
                                        ]],
                        spending: [
                                monthlyInstanceBudget  : 1d,
                                monthlyInstanceSpending: 2d,
                                monthlyStorageBudget   : 3d,
                                monthlyStorageSpending : 4d,
                                storageQuota           : 5d,
                                storageUsed            : 6d
                        ]
                )
            }

            post('/api/data/scenes/retrieve') {
//  { countryIso:ITA, scenes:[ {sceneId: 'LC81900302015079LGN00', sensor: 'LANDSAT_8'}, ... ] }
//                params.selection

                send toJson("[status:OK]")
            }
            post('/api/data/scenes/mosaic') {
//  { countryIso:ITA, scenes:[ {sceneId: 'LC81900302015079LGN00', sensor: 'LANDSAT_8'}, ... ] }
//                params.selection

                send toJson("[status:OK]")
            }

            get('/api/tasks') {
                response.contentType = 'application/json'
                //'ACTIVE|FAILED|COMPLETED|PENDING',
                def tasks = [
                        [
                                id               : 'a',
                                name             : 'downloading scene LC81900302015079LGN00 from some part of hte universe',
                                status           : 'ACTIVE',
                                statusDescription: 'currently downloading something from somewhere currently downloading something from somewhere currently downloading something from somewhere currently downloading something from somewhere currently downloading something from somewhere currently downloading something from somewhere currently downloading something from somewhere currently downloading something from somewhere currently downloading something from somewhere currently downloading something from somewhere'
                        ]
                        , [
                                id               : 'b',
                                name             : 'ciao2',
                                status           : 'PENDING',
                                statusDescription: 'currently downloading something from somewhere'
                        ]
                        , [
                                id               : 'c',
                                name             : 'ciao3',
                                status           : 'COMPLETED',
                                statusDescription: 'currently downloading something from somewhere'
                        ]
                        , [
                                id               : 'd',
                                name             : 'ciao4',
                                status           : 'FAILED',
                                statusDescription: 'currently downloading something from somewhere'
                        ]
                ]
                send toJson(tasks)
            }

            /**
             * Valid when status is ACTIVE or PENDING.
             */
            post('/api/tasks/task/{id}/cancel') {
                response.status = 204
            }

            /**
             * Valid when status is COMPLETED or FAILED.
             */
            post('/api/tasks/task/{id}/remove') {
                response.status = 204
            }

            /**
             * Valid when status is COMPLETED or FAILED.
             */
            post('/api/tasks/task/{id}/execute') {
                response.status = 204
            }

            /**
             * Removes all COMPLETED or FAILED tasks.
             */
            post('/api/tasks/remove') {
                response.status = 204
            }

            get('/api/data/sensors') {
                response.contentType = 'application/json'

                def s = [
                        [
                                id        : 'landsat',
                                label     : 'landsat',
                                sensors   : [
                                        [
                                                id       : 'LANDSAT_8',
                                                name     : 'Landsat 8 OLI/TIRS',
                                                shortName: 'L8'
                                        ],

                                        [
                                                id       : 'LANDSAT_ETM_SLC_OFF',
                                                name     : 'Landsat 7 ETM+ (SLC-off)',
                                                shortName: 'L7 SLC-off'
                                        ],

                                        [
                                                id       : 'LANDSAT_ETM',
                                                name     : 'Landsat 7 ETM+ (SLC-on)',
                                                shortName: 'L7 SLC-on'
                                        ],

                                        [
                                                id       : 'LANDSAT_TM',
                                                name     : 'Landsat 4-5 TM',
                                                shortName: 'L4-5 TM'
                                        ],

                                        [
                                                id       : 'LANDSAT_MSS',
                                                name     : 'Landsat 1-5 MSS',
                                                shortName: 'L1-5 MSS'
                                        ]
                                ],
                                bands     : [
                                        [
                                                id   : 'B1',
                                                label: 'Blue'
                                        ],
                                        [
                                                id   : 'B2',
                                                label: 'Green'
                                        ],
                                ],
                                bandGroups: [
                                        [
                                                id   : 'B3, B2, B1',
                                                label: 'Natural (RGB)'
                                        ],
                                        [
                                                id   : 'B4, B5, B3',
                                                label: 'False color'
                                        ]
                                ]
                        ]


                ]

                return toJson(s)
            }

            post('/api/data/sceneareas') {
                response.contentType = 'application/json'

                // TODO add 
                params.sensorFamily


                params.countryIso
//                params.polygon

                send '[{"sceneAreaId":"185_32","polygon":[[41.289,20.012],[39.68999999999999,19.530000000000005],[39.369,21.738],[40.96,22.271000000000004],[41.289,20.012]]},{"sceneAreaId":"187_31","polygon":[[42.718,17.367],[41.121,16.869000000000007],[40.793,19.125],[42.382,19.677],[42.718,17.367]]},{"sceneAreaId":"186_31","polygon":[[42.718,18.912],[41.121,18.413999999999998],[40.793,20.67],[42.382,21.221999999999998],[42.718,18.912]]},{"sceneAreaId":"185_31","polygon":[[42.718,20.458],[41.121,19.959000000000003],[40.793000000000006,22.215],[42.382,22.767000000000003],[42.718,20.458]]},{"sceneAreaId":"187_30","polygon":[[44.14600000000001,17.827999999999996],[42.551,17.313000000000002],[42.21500000000001,19.619000000000007],[43.802,20.192],[44.14600000000001,17.827999999999996]]},{"sceneAreaId":"186_30","polygon":[[44.14600000000001,19.372999999999998],[42.551,18.858000000000004],[42.21500000000001,21.164],[43.802,21.737],[44.14600000000001,19.372999999999998]]},{"sceneAreaId":"185_33","polygon":[[39.858,19.581],[38.25800000000001,19.112],[37.943,21.277],[39.536,21.793],[39.858,19.581]]},{"sceneAreaId":"186_32","polygon":[[41.288999999999994,18.467],[39.68999999999999,17.984],[39.369,20.193],[40.95999999999999,20.725999999999996],[41.288999999999994,18.467]]}]'
            }

            post('/api/data/best-scenes') {
                response.contentType = 'application/json'

                send '{"185_32":[{"sceneId":"LC81850322016287LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016287LGN00.jpg","acquisitionDate":"2016-10-13","cloudCover":5.96,"sunAzimuth":158.84342655,"sunElevation":39.36680887,"daysFromTargetDay":50},{"sceneId":"LE71850322016023NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/32/2016/LE71850322016023NSG00_REFL.jpg","acquisitionDate":"2016-01-23","cloudCover":10.93,"sunAzimuth":156.32223511,"sunElevation":26.60946465,"daysFromTargetDay":51},{"sceneId":"LE71850322016327NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/32/2016/LE71850322016327NSG00_REFL.jpg","acquisitionDate":"2016-11-22","cloudCover":38.39,"sunAzimuth":163.16265869,"sunElevation":27.63088226,"daysFromTargetDay":10},{"sceneId":"LC81850322016303LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016303LGN00.jpg","acquisitionDate":"2016-10-29","cloudCover":28.54,"sunAzimuth":161.43190429,"sunElevation":34.07472099,"daysFromTargetDay":34},{"sceneId":"LC81850322016031LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016031LGN00.jpg","acquisitionDate":"2016-01-31","cloudCover":18.85,"sunAzimuth":154.71089498,"sunElevation":28.26608719,"daysFromTargetDay":59},{"sceneId":"LE71850322016279NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/32/2016/LE71850322016279NSG00_REFL.jpg","acquisitionDate":"2016-10-05","cloudCover":20.83,"sunAzimuth":157.74961853,"sunElevation":42.28244781,"daysFromTargetDay":58}],"187_31":[{"sceneId":"LE71870312016037NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/31/2016/LE71870312016037NSG00_REFL.jpg","acquisitionDate":"2016-02-06","cloudCover":0.2,"sunAzimuth":155.04808044,"sunElevation":28.84342957,"daysFromTargetDay":65},{"sceneId":"LE71870312016277NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/31/2016/LE71870312016277NSG00_REFL.jpg","acquisitionDate":"2016-10-03","cloudCover":5.78,"sunAzimuth":158.21365356,"sunElevation":41.75606537,"daysFromTargetDay":60},{"sceneId":"LC81870312016269LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/031/LC81870312016269LGN00.jpg","acquisitionDate":"2016-09-25","cloudCover":2.95,"sunAzimuth":155.34863406,"sunElevation":44.36202249,"daysFromTargetDay":68}],"186_31":[{"sceneId":"LC81860312016326LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":5.69,"sunAzimuth":163.23488684,"sunElevation":26.45837826,"daysFromTargetDay":11},{"sceneId":"LE71860312016030NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016030NSG00_REFL.jpg","acquisitionDate":"2016-01-30","cloudCover":4.47,"sunAzimuth":155.98269653,"sunElevation":26.98164558,"daysFromTargetDay":58},{"sceneId":"LC81860312016022LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016022LGN00.jpg","acquisitionDate":"2016-01-22","cloudCover":9.82,"sunAzimuth":156.69346639,"sunElevation":25.08324978,"daysFromTargetDay":50},{"sceneId":"LC81860312016038LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016038LGN00.jpg","acquisitionDate":"2016-02-07","cloudCover":5.73,"sunAzimuth":154.42462931,"sunElevation":28.97381115,"daysFromTargetDay":66}],"185_31":[{"sceneId":"LC81850312016303LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/031/LC81850312016303LGN00.jpg","acquisitionDate":"2016-10-29","cloudCover":0.33,"sunAzimuth":162.13679878,"sunElevation":32.80485752,"daysFromTargetDay":34},{"sceneId":"LC81850312016287LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/031/LC81850312016287LGN00.jpg","acquisitionDate":"2016-10-13","cloudCover":3.19,"sunAzimuth":159.69310094,"sunElevation":38.12895399,"daysFromTargetDay":50},{"sceneId":"LE71850312016023NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/31/2016/LE71850312016023NSG00_REFL.jpg","acquisitionDate":"2016-01-23","cloudCover":9.56,"sunAzimuth":156.95932007,"sunElevation":25.40877914,"daysFromTargetDay":51}],"187_30":[{"sceneId":"LE71870302016037NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/30/2016/LE71870302016037NSG00_REFL.jpg","acquisitionDate":"2016-02-06","cloudCover":7.36,"sunAzimuth":155.75964355,"sunElevation":27.6642189,"daysFromTargetDay":65},{"sceneId":"LE71870302016325NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/30/2016/LE71870302016325NSG00_REFL.jpg","acquisitionDate":"2016-11-20","cloudCover":50.19,"sunAzimuth":164.34642029,"sunElevation":25.49570656,"daysFromTargetDay":12},{"sceneId":"LC81870302016269LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/030/LC81870302016269LGN00.jpg","acquisitionDate":"2016-09-25","cloudCover":23.42,"sunAzimuth":156.40770553,"sunElevation":43.17571685,"daysFromTargetDay":68},{"sceneId":"LE71870302016229NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/30/2016/LE71870302016229NSG00_REFL.jpg","acquisitionDate":"2016-08-16","cloudCover":4.4,"sunAzimuth":144.52908325,"sunElevation":55.93079376,"daysFromTargetDay":108},{"sceneId":"LE71870302016213NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/30/2016/LE71870302016213NSG00_REFL.jpg","acquisitionDate":"2016-07-31","cloudCover":0.09,"sunAzimuth":139.64707947,"sunElevation":59.72838593,"daysFromTargetDay":124}],"186_30":[{"sceneId":"LC81860302016326LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":7.87,"sunAzimuth":163.81622137,"sunElevation":25.17122728,"daysFromTargetDay":11},{"sceneId":"LE71860302016030NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/30/2016/LE71860302016030NSG00_REFL.jpg","acquisitionDate":"2016-01-30","cloudCover":17.82,"sunAzimuth":156.65101624,"sunElevation":25.78956032,"daysFromTargetDay":58},{"sceneId":"LC81860302016038LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016038LGN00.jpg","acquisitionDate":"2016-02-07","cloudCover":22.48,"sunAzimuth":155.1453536,"sunElevation":27.80351697,"daysFromTargetDay":66},{"sceneId":"LE71860302016078NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/30/2016/LE71860302016078NSG00_REFL.jpg","acquisitionDate":"2016-03-18","cloudCover":0.52,"sunAzimuth":151.54496765,"sunElevation":42.37598419,"daysFromTargetDay":106}],"185_33":[{"sceneId":"LE71850332016327NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/33/2016/LE71850332016327NSG00_REFL.jpg","acquisitionDate":"2016-11-22","cloudCover":9.03,"sunAzimuth":162.57658386,"sunElevation":28.91710091,"daysFromTargetDay":10},{"sceneId":"LC81850332016287LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/033/LC81850332016287LGN00.jpg","acquisitionDate":"2016-10-13","cloudCover":0.06,"sunAzimuth":157.9716826,"sunElevation":40.59595098,"daysFromTargetDay":50}],"186_32":[{"sceneId":"LC81860322016326LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":4.2,"sunAzimuth":162.64845679,"sunElevation":27.7421774,"daysFromTargetDay":11},{"sceneId":"LC81860322016310LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016310LGN00.jpg","acquisitionDate":"2016-11-05","cloudCover":12.23,"sunAzimuth":162.10359277,"sunElevation":31.93549331,"daysFromTargetDay":27},{"sceneId":"LC81860322016022LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016022LGN00.jpg","acquisitionDate":"2016-01-22","cloudCover":9.24,"sunAzimuth":156.05980205,"sunElevation":26.28084328,"daysFromTargetDay":50},{"sceneId":"LE71860322016014NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/32/2016/LE71860322016014NSG00_REFL.jpg","acquisitionDate":"2016-01-14","cloudCover":15.06,"sunAzimuth":157.64157104,"sunElevation":25.07288361,"daysFromTargetDay":42}]}'
            }


            get('/api/data/sceneareas/{sceneAreaId}') {
                response.contentType = 'application/json'

                params.targetDay //MM-dd
                params.fromDate //YYYY-MM-dd
                params.toDate  //YYYY-MM-dd

                send toJson([
                        [sceneId: 'LC81900302015079LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015079LGN00.jpg', acquisitionDate: '2015-03-20', cloudCover: 0.08, sunAzimuth: 150.48942477, sunElevation: 42.80026465, daysFromTargetDay: 5],
                        [sceneId: 'LC81900302015079LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015079LGN00.jpg', acquisitionDate: '2015-03-20', cloudCover: 0.08, sunAzimuth: 150.48942477, sunElevation: 42.80026465, daysFromTargetDay: 50],
                        [sceneId: 'LE71900302015183NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015183NSG00.jpg', acquisitionDate: '2015-07-02', cloudCover: 0.09, sunAzimuth: 133.80200195, sunElevation: 63.82229996, daysFromTargetDay: 100],
                        [sceneId: 'LE71900302015183NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015183NSG00.jpg', acquisitionDate: '2015-07-02', cloudCover: 0.09, sunAzimuth: 133.80200195, sunElevation: 63.82229996, daysFromTargetDay: 0],
                        [sceneId: 'LE71900302015199NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015199NSG00.jpg', acquisitionDate: '2015-07-18', cloudCover: 0.1, sunAzimuth: 135.36825562, sunElevation: 61.8910408, daysFromTargetDay: 120],
                        [sceneId: 'LE71900302015199NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015199NSG00.jpg', acquisitionDate: '2015-07-18', cloudCover: 0.1, sunAzimuth: 135.36825562, sunElevation: 61.8910408, daysFromTargetDay: 1],
                        [sceneId: 'LE71900302016106NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016106NSG00.jpg', acquisitionDate: '2016-04-15', cloudCover: 0.34, sunAzimuth: 148.4969635, sunElevation: 53.07840347, daysFromTargetDay: 6],
                        [sceneId: 'LE71900302016106NSG00', sensor: 'LANDSAT_ETM_SLC_OFF', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016106NSG00.jpg', acquisitionDate: '2016-04-15', cloudCover: 0.34, sunAzimuth: 148.4969635, sunElevation: 53.07840347, daysFromTargetDay: 4],
                        [sceneId: 'LE71900302015311NSG00', sensor: 'LANDSAT_ETM_SLC_OFF', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015311NSG00.jpg', acquisitionDate: '2015-11-07', cloudCover: 0.47, sunAzimuth: 163.56713867, sunElevation: 29.02179146, daysFromTargetDay: 4],
                        [sceneId: 'LE71900302015103NSG00', sensor: 'LANDSAT_ETM_SLC_OFF', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015103NSG00.jpg', acquisitionDate: '2015-04-13', cloudCover: 0.47, sunAzimuth: 147.74519348, sunElevation: 51.80644989, daysFromTargetDay: 4],
                        [sceneId: 'LE71900302015103NSG00', sensor: 'LANDSAT_ETM_SLC_OFF', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015103NSG00.jpg', acquisitionDate: '2015-04-13', cloudCover: 0.47, sunAzimuth: 147.74519348, sunElevation: 51.80644989, daysFromTargetDay: 5],
                        [sceneId: 'LE71900302015311NSG00', sensor: 'LANDSAT_TM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015311NSG00.jpg', acquisitionDate: '2015-11-07', cloudCover: 0.47, sunAzimuth: 163.56713867, sunElevation: 29.02179146, daysFromTargetDay: 101],
                        [sceneId: 'LE71900302016026NSG00', sensor: 'LANDSAT_TM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016026NSG00.jpg', acquisitionDate: '2016-01-26', cloudCover: 1.02, sunAzimuth: 157.18023682, sunElevation: 24.84968567, daysFromTargetDay: 99],
                        [sceneId: 'LE71900302016026NSG00', sensor: 'LANDSAT_TM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016026NSG00.jpg', acquisitionDate: '2016-01-26', cloudCover: 1.02, sunAzimuth: 157.18023682, sunElevation: 24.84968567, daysFromTargetDay: 52],
                        [sceneId: 'LC81900302015111LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015111LGN00.jpg', acquisitionDate: '2015-04-21', cloudCover: 1.4, sunAzimuth: 146.37338078, sunElevation: 54.70757449, daysFromTargetDay: 23],
                        [sceneId: 'LC81900302015111LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015111LGN00.jpg', acquisitionDate: '2015-04-21', cloudCover: 1.4, sunAzimuth: 146.37338078, sunElevation: 54.70757449, daysFromTargetDay: 5],
                        [sceneId: 'LC81900302015191LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015191LGN00.jpg', acquisitionDate: '2015-07-10', cloudCover: 1.76, sunAzimuth: 134.20303675, sunElevation: 62.96916492, daysFromTargetDay: 54],
                        [sceneId: 'LC81900302015191LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015191LGN00.jpg', acquisitionDate: '2015-07-10', cloudCover: 1.76, sunAzimuth: 134.20303675, sunElevation: 62.96916492, daysFromTargetDay: 1],
                        [sceneId: 'LC81900302015015LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015015LGN00.jpg', acquisitionDate: '2015-01-15', cloudCover: 1.85, sunAzimuth: 158.23985381, sunElevation: 22.88232301, daysFromTargetDay: 58],
                        [sceneId: 'LC81900302015015LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015015LGN00.jpg', acquisitionDate: '2015-01-15', cloudCover: 1.85, sunAzimuth: 158.23985381, sunElevation: 22.88232301, daysFromTargetDay: 129],
                        [sceneId: 'LC81900302015239LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015239LGN00.jpg', acquisitionDate: '2015-08-27', cloudCover: 2.28, sunAzimuth: 146.90510045, sunElevation: 52.77744787, daysFromTargetDay: 21],
                        [sceneId: 'LC81900302015239LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015239LGN00.jpg', acquisitionDate: '2015-08-27', cloudCover: 2.28, sunAzimuth: 146.90510045, sunElevation: 52.77744787, daysFromTargetDay: 62],
                        [sceneId: 'LC81900302015127LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015127LGN00.jpg', acquisitionDate: '2015-05-07', cloudCover: 2.78, sunAzimuth: 143.40108505, sunElevation: 59.2340895, daysFromTargetDay: 144],
                        [sceneId: 'LC81900302015127LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015127LGN00.jpg', acquisitionDate: '2015-05-07', cloudCover: 2.78, sunAzimuth: 143.40108505, sunElevation: 59.2340895, daysFromTargetDay: 11],
                        [sceneId: 'LC81900302016050LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2016/190/030/LC81900302016050LGN00.jpg', acquisitionDate: '2016-02-19', cloudCover: 2.98, sunAzimuth: 153.68447136, sunElevation: 31.61607965, daysFromTargetDay: 64]
                ])
            }

//            User apis


            post('/user/login') {
                def usernamePassword = Decode.base64(
                        request.getHeader('authorization').substring('Basic '.length())
                ).split(':')
                def username = usernamePassword[0]
                def password = usernamePassword[1]
                println "Logging in with username $username and password $password"

                response.contentType = 'application/json'
                def user = authenticator.users[username]
                if (user && authenticator.verify(username, password)) {
                    request.session.setAttribute(CURRENT_USER_SESSION_ATTRIBUTE, user)
                    send toJson(user)
                } else
                    halt(401)
            }

            post('/logout') {
                println "Logging out"

                response.contentType = 'application/json'
                halt(401)
            }

            get('/user/current') {
                println "Getting current user"

                response.contentType = 'application/json'
                if (currentUser)
                    send toJson(authenticator.users.values().first())
                else
                    halt(401)
            }

            post('/user/current/details') {
                def name = params.required('name', String)
                def email = params.required('email', String)
                def organization = params.required('organization', String)
                println "Updated details of current user to {name: $name, email: $email, organization: $organization}"

                response.contentType = 'application/json'
                send toJson(currentUser)
            }


            post('/user/details') {
                def username = params.required('username', String)
                def name = params.required('name', String)
                def email = params.required('email', String)
                def organization = params.required('organization', String)
                println "Updated details of user $username to {name: $name, email: $email, organization: $organization}"

                response.contentType = 'application/json'
                println(params)
                send toJson(someUser())
            }

            // TODO: Lock, unlock user

            get('/user/list') {
                println "Listed all users"

                response.contentType = 'application/json'
                send toJson(authenticator.users.values())
            }

            post('/user/invite') {
                def username = params.required('invitedUsername', String)
                def name = params.required('name', String)
                def email = params.required('email', String)
                def organization = params.required('organization', String)
                println "Invited user {invitedUsername: $username, name: $name, email: $email, organization: $organization}"

                response.contentType = 'application/json'
                send toJson([status: 'success', message: 'Invitation sent'])
            }

            post('/user/activate') {
                def token = params.required('token', String)
                def password = params.required('password', String)
                println "Activated user and set password to $password, using token $token"

                authenticator.password(someUser().username, password)
                response.contentType = 'application/json'
                send toJson(someUser())
            }

            post('/user/password/reset-request') {
                def email = params.required('email', String)
                println "Requested password reset to email $email"

                response.contentType = 'application/json'
                send toJson([status : 'success',
                             message: 'If there is an account with this email, ' +
                                     'an email with a password reset link will be sent there'])
            }

            post('/user/password/reset') {
                def token = params.required('token', String)
                def password = params.required('password', String)
                println "Reset password to $password using token $token"

                authenticator.password(someUser().username, password)
                response.contentType = 'application/json'
                send toJson(someUser())
            }

            post('/user/current/password') {
                def oldPassword = params.required('oldPassword', String)
                def newPassword = params.required('newPassword', String)
                println "Changing password from $oldPassword to $newPassword"

                authenticator.password(currentUser.username, newPassword)
                response.contentType = 'application/json'
                send toJson([status: 'success', message: 'Password changes'])
            }

            post('/user/validate-token') {
                def token = params.required('token')
                println "Validated token $token"

                if (token == 'valid')
                    send toJson([status: 'success', token: token, user: someUser(), message: 'Token is valid'])
                else
                    send toJson([status: 'failure', token: token, reason: token, message: "Token is $token"])
                // reason: 'expired' or 'invalid'
            }

            post('/user/delete') {
                def username = params.required('username', String)
                println "Deleted user with username $username"

                // TODO: Use username instead of ID
                response.contentType = 'application/json'
                authenticator.users.remove(username)
                send toJson([status: 'success', message: 'User deleted'])
            }

            get('/api/data/google-maps-api-key') {
                response.contentType = 'application/json'
                send toJson(apiKey: '')
            }

            post('/budget') {
                response.contentType = 'application/json'
                def username = params.required('username', String)
                params.monthlyInstanceBudget
                params.monthlyStorageBudget
                params.storageQuota
                println(params)

                send toJson(status: 'success')
            }

            get('/budget/report') {
                response.contentType = 'application/json'
                send toJson(
                        'demo': [
                                monthlyInstanceBudget  : 1d,
                                monthlyInstanceSpending: 2d,
                                monthlyStorageBudget   : 3d,
                                monthlyStorageSpending : 4d,
                                storageQuota           : 5d,
                                storageUsed            : 6d],
                        'demo2': [
                                monthlyInstanceBudget  : 1d,
                                monthlyInstanceSpending: 2d,
                                monthlyStorageBudget   : 3d,
                                monthlyStorageSpending : 4d,
                                storageQuota           : 5d,
                                storageUsed            : 6d],
                        'demo3': [
                                monthlyInstanceBudget  : 2d,
                                monthlyInstanceSpending: 4d,
                                monthlyStorageBudget   : 6d,
                                monthlyStorageSpending : 7d,
                                storageQuota           : 9d,
                                storageUsed            : 18d])
            }


            get('/apps') {
                response.contentType = 'application/json'
                send '''
                    [
                      {
                        "path": "/sandbox/shiny/accuracy-assessment/aa_design",
                        "label": "Accuracy Assessment Design"
                      },
                      {
                        "path": "/sandbox/shiny/accuracy-assessment/aa_analysis",
                        "label": "Accuracy Assessment Analysis"
                      },
                      {
                        "path": "/sandbox/shiny/geo-processing",
                        "label": "GEO Processing"
                      },
                      {
                        "path": "/sandbox/shiny/visualize",
                        "label": "Visualize"
                      },
                      {
                        "path": "/sandbox/shiny/osk",
                        "label": "SAR Toolkit"
                      }
                    ]'''o
            }

            boolean sandboxServerUp = false
            // visualization - sandbox apis
            post('/sandbox/start') {
                if (sandboxServerUp)
                    return send([status: 'STARTED'])
                else
                    return send([status: 'STARTING'])
            }

            get('/sandbox/**') {
                while(!sandboxServerUp)
                    Thread.sleep(1000)
                send('Response from sandbox')
            }

            // Testing purposes - determine whether sandbox is up or down
            get('/sandbox-server/up') {
                sandboxServerUp = true
            }

            get('/sandbox-server/down') {
                sandboxServerUp = false
            }


        }
        return controller
    }

    static void main(String[] args) {
        new ResourceServer(9999, '/', new MockServer()).start()
    }

}
