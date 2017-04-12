package frontend

import groovy.json.JsonSlurper
import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import groovymvc.Params
import groovymvc.ParamsException
import groovymvc.util.Decode
import org.openforis.sepal.component.datasearch.adapter.HttpGoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.api.*
import org.openforis.sepal.endpoint.ResourceServer

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson
import static groovymvc.RequestContext.CURRENT_USER_SESSION_ATTRIBUTE

class MockServer extends AbstractMvcFilter {
    private static final FUSION_TABLE = '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F'
    private static final KEY_COLUMN = 'ISO'

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


            delete('/api/user/files/{path}') {
                response.contentType = 'application/json'
                Thread.sleep(1500)
                def path = URLDecoder.decode(params.path, "UTF-8")
                send toJson("[status:OK]")
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

            Object spending = [
                    monthlyInstanceBudget  : 2d,
                    monthlyInstanceSpending: 1d,
                    monthlyStorageBudget   : 4d,
                    monthlyStorageSpending : 3d,
                    storageQuota           : 6d,
                    storageUsed            : 5d
            ]
            get('/api/budget-exceeded') {
                response.contentType = 'application/json'
                boolean value = params.q
                if (value == true) {
                    spending = [
                            monthlyInstanceBudget  : 2d,
                            monthlyInstanceSpending: 3d,
                            monthlyStorageBudget   : 4d,
                            monthlyStorageSpending : 5d,
                            storageQuota           : 6d,
                            storageUsed            : 7d
                    ]
                } else {
                    spending = [
                            monthlyInstanceBudget  : 2d,
                            monthlyInstanceSpending: 1d,
                            monthlyStorageBudget   : 4d,
                            monthlyStorageSpending : 3d,
                            storageQuota           : 6d,
                            storageUsed            : 5d
                    ]
                }
                send toJson("[budget-exceeded:" + value + "]")
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
                        spending: spending
                )
            }

            post('/api/data/scenes/retrieve') {
//  { countryIso:ITA, scenes:[ {sceneId: 'LC81900302015079LGN00', sensor: 'LANDSAT_8'}, ... ] }
//                params.selection
                def sceneIds = fromJson(params.required('sceneIds', String))

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
                                                id   : 'BLUE',
                                                label: 'Blue'
                                        ],
                                        [
                                                id   : 'GREEN',
                                                label: 'Green'
                                        ],
                                ],
                                bandGroups: [
                                        [
                                                id   : 'SWIR2, NIR, GREEN',
                                                label: 'Natural (RGB)'
                                        ],
                                        [
                                                id   : 'NIR, SWIR1, RED',
                                                label: 'False color'
                                        ]
                                ]
                        ]


                ]

                return toJson(s)
            }

            post('/api/data/sceneareas') {
                response.contentType = 'application/json'

                if (params.dataSet == 'SENTINEL2')
                    send '[{"sceneAreaId":"34TCK","polygon":[[39.638217999999995,18.669348999999997],[39.656847,19.948551],[40.645928,19.933184999999998],[40.62664,18.635318999999996],[39.638217999999995,18.669348999999997]]},{"sceneAreaId":"34TCL","polygon":[[40.538608,18.638419],[40.55783699999999,19.934585],[41.546759,19.918508],[41.526851999999984,18.602816999999998],[40.538608,18.638419]]},{"sceneAreaId":"34TCM","polygon":[[41.43883600000001,18.606061000000004],[41.458682,19.919973],[42.44744299999999,19.903148],[42.426902000000005,18.568804],[41.43883600000001,18.606061000000004]]},{"sceneAreaId":"34TCN","polygon":[[42.338362,18.572219],[42.35884,19.904691],[43.34744,19.887078],[43.32624599999999,18.533218000000005],[42.338362,18.572219]]},{"sceneAreaId":"34TDK","polygon":[[39.655753000000004,19.833867999999995],[39.661551,21.11378],[40.65079899999999,21.115442999999992],[40.644795,19.816827000000004],[39.655753000000004,19.833867999999995]]},{"sceneAreaId":"34TDL","polygon":[[40.556707,19.81838000000001],[40.562692,21.115292],[41.551785,21.117032],[41.545589,19.800551],[40.556707,19.81838000000001]]},{"sceneAreaId":"34TDM","polygon":[[41.457515,19.802175],[41.463693,21.116873],[42.45262999999999,21.118693999999994],[42.44623599999999,19.783517],[41.457515,19.802175]]},{"sceneAreaId":"34TDN","polygon":[[43.346195,19.765694000000003],[42.357636,19.785227],[42.364011,21.118527000000004],[43.352792,21.120434],[43.346195,19.765694000000003]]},{"sceneAreaId":"34TEK","polygon":[[39.661607000000004,20.99976699999999],[39.654557,22.279642],[40.643557,22.298341],[40.650857,20.999763],[39.661607000000004,20.99976699999999]]},{"sceneAreaId":"34TEL","polygon":[[40.56275000000001,20.999764],[40.555473,22.296637000000008],[41.54431199999999,22.3162],[41.551845,20.99976000000001],[40.56275000000001,20.999764]]},{"sceneAreaId":"34SCJ","polygon":[[38.73821,18.698903000000012],[38.756254,19.961895],[39.745494,19.947204],[39.726806,18.666367],[38.73821,18.698903000000012]]},{"sceneAreaId":"34SDJ","polygon":[[38.755194,19.848668],[38.760810000000006,21.112336],[39.750212,21.113926],[39.744395000000004,19.832375000000003],[38.755194,19.848668]]}]'
                else
                    send '[{"sceneAreaId":"185_32","polygon":[[41.289,20.012],[39.68999999999999,19.530000000000005],[39.369,21.738],[40.96,22.271000000000004],[41.289,20.012]]},{"sceneAreaId":"187_31","polygon":[[42.718,17.367],[41.121,16.869000000000007],[40.793,19.125],[42.382,19.677],[42.718,17.367]]},{"sceneAreaId":"186_31","polygon":[[42.718,18.912],[41.121,18.413999999999998],[40.793,20.67],[42.382,21.221999999999998],[42.718,18.912]]},{"sceneAreaId":"185_31","polygon":[[42.718,20.458],[41.121,19.959000000000003],[40.793000000000006,22.215],[42.382,22.767000000000003],[42.718,20.458]]},{"sceneAreaId":"187_30","polygon":[[44.14600000000001,17.827999999999996],[42.551,17.313000000000002],[42.21500000000001,19.619000000000007],[43.802,20.192],[44.14600000000001,17.827999999999996]]},{"sceneAreaId":"186_30","polygon":[[44.14600000000001,19.372999999999998],[42.551,18.858000000000004],[42.21500000000001,21.164],[43.802,21.737],[44.14600000000001,19.372999999999998]]},{"sceneAreaId":"185_33","polygon":[[39.858,19.581],[38.25800000000001,19.112],[37.943,21.277],[39.536,21.793],[39.858,19.581]]},{"sceneAreaId":"186_32","polygon":[[41.288999999999994,18.467],[39.68999999999999,17.984],[39.369,20.193],[40.95999999999999,20.725999999999996],[41.288999999999994,18.467]]}]'
            }

            post('/api/data/best-scenes') {
                response.contentType = 'application/json'
                if (params.dataSet == 'SENTINEL2')
                    send '{"34TCK":[{"sceneId":"20160626T093744_20160626T131738_T34TCK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CK/2016/6/26/0/preview.jpg","acquisitionDate":"2016-06-26","cloudCover":0.13,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":2},{"sceneId":"20160629T094727_20160629T150301_T34TCK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CK/2016/6/29/0/preview.jpg","acquisitionDate":"2016-06-29","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":5},{"sceneId":"20160706T093337_20160706T131800_T34TCK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CK/2016/7/6/0/preview.jpg","acquisitionDate":"2016-07-06","cloudCover":0.0957,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":12}],"34TCL":[{"sceneId":"20160626T093744_20160626T131738_T34TCL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CL/2016/6/26/0/preview.jpg","acquisitionDate":"2016-06-26","cloudCover":0.0096,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":2},{"sceneId":"20160629T094727_20160629T150301_T34TCL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CL/2016/6/29/0/preview.jpg","acquisitionDate":"2016-06-29","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":5},{"sceneId":"20160706T093337_20160706T131800_T34TCL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CL/2016/7/6/0/preview.jpg","acquisitionDate":"2016-07-06","cloudCover":0.3151,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":12}],"34TCM":[{"sceneId":"20160626T093744_20160626T131738_T34TCM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CM/2016/6/26/0/preview.jpg","acquisitionDate":"2016-06-26","cloudCover":2.3312,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":2},{"sceneId":"20160629T094727_20160629T150301_T34TCM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CM/2016/6/29/0/preview.jpg","acquisitionDate":"2016-06-29","cloudCover":1.6871,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":5},{"sceneId":"20160706T093337_20160706T131800_T34TCM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CM/2016/7/6/0/preview.jpg","acquisitionDate":"2016-07-06","cloudCover":1.7342,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":12},{"sceneId":"20160709T094845_20160709T132633_T34TCM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CM/2016/7/9/0/preview.jpg","acquisitionDate":"2016-07-09","cloudCover":0.48,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":15}],"34TCN":[{"sceneId":"20160709T094845_20160709T132633_T34TCN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CN/2016/7/9/0/preview.jpg","acquisitionDate":"2016-07-09","cloudCover":2.2546,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":15},{"sceneId":"20160709T094034_20160709T132911_T34TCN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CN/2016/7/9/0/preview.jpg","acquisitionDate":"2016-07-09","cloudCover":6.4235,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":15},{"sceneId":"20160629T094727_20160629T150301_T34TCN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CN/2016/6/29/0/preview.jpg","acquisitionDate":"2016-06-29","cloudCover":12.176,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":5},{"sceneId":"20160527T093441_20160527T131812_T34TCN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CN/2016/5/27/0/preview.jpg","acquisitionDate":"2016-05-27","cloudCover":1.2935,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":28},{"sceneId":"20160729T094035_20160729T134414_T34TCN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CN/2016/7/29/0/preview.jpg","acquisitionDate":"2016-07-29","cloudCover":2.5191,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":35},{"sceneId":"20160805T093733_20160805T131813_T34TCN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/CN/2016/8/5/0/preview.jpg","acquisitionDate":"2016-08-05","cloudCover":0.0248,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":42}],"34TDK":[{"sceneId":"20160616T093438_20160616T131744_T34TDK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DK/2016/6/16/0/preview.jpg","acquisitionDate":"2016-06-16","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":8},{"sceneId":"20160623T092257_20160623T130948_T34TDK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DK/2016/6/23/0/preview.jpg","acquisitionDate":"2016-06-23","cloudCover":7.2133,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":1},{"sceneId":"20160703T092030_20160703T130848_T34TDK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DK/2016/7/3/0/preview.jpg","acquisitionDate":"2016-07-03","cloudCover":7.5911,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":9},{"sceneId":"20160706T093337_20160706T131800_T34TDK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DK/2016/7/6/0/preview.jpg","acquisitionDate":"2016-07-06","cloudCover":8.7859,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":12}],"34TDL":[{"sceneId":"20160616T093438_20160616T131744_T34TDL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DL/2016/6/16/0/preview.jpg","acquisitionDate":"2016-06-16","cloudCover":0.3547,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":8},{"sceneId":"20160703T092030_20160703T130848_T34TDL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DL/2016/7/3/0/preview.jpg","acquisitionDate":"2016-07-03","cloudCover":1.7255,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":9},{"sceneId":"20160623T092257_20160623T130948_T34TDL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DL/2016/6/23/0/preview.jpg","acquisitionDate":"2016-06-23","cloudCover":10.4851,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":1},{"sceneId":"20160713T092032_20160713T125925_T34TDL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DL/2016/7/13/0/preview.jpg","acquisitionDate":"2016-07-13","cloudCover":3.8496,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":19},{"sceneId":"20160723T092032_20160723T130751_T34TDL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DL/2016/7/23/0/preview.jpg","acquisitionDate":"2016-07-23","cloudCover":0.1246,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":29},{"sceneId":"20160626T093744_20160626T131738_T34TDL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DL/2016/6/26/0/preview.jpg","acquisitionDate":"2016-06-26","cloudCover":15.3446,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":2},{"sceneId":"20160527T093441_20160527T131812_T34TDL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DL/2016/5/27/0/preview.jpg","acquisitionDate":"2016-05-27","cloudCover":1.4209,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":28}],"34TDM":[{"sceneId":"20160616T093438_20160616T131744_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/6/16/0/preview.jpg","acquisitionDate":"2016-06-16","cloudCover":3.2043,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":8},{"sceneId":"20160609T094855_20160614T085038_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/6/9/0/preview.jpg","acquisitionDate":"2016-06-09","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":15},{"sceneId":"20160709T094845_20160709T132633_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/7/9/0/preview.jpg","acquisitionDate":"2016-07-09","cloudCover":3.6518,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":15},{"sceneId":"20160706T093337_20160706T131800_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/7/6/0/preview.jpg","acquisitionDate":"2016-07-06","cloudCover":8.8931,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":12},{"sceneId":"20160629T094727_20160629T150301_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/6/29/0/preview.jpg","acquisitionDate":"2016-06-29","cloudCover":15.3288,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":5},{"sceneId":"20160709T094034_20160709T132911_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/7/9/0/preview.jpg","acquisitionDate":"2016-07-09","cloudCover":10.64,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":15},{"sceneId":"20160729T094849_20160729T132630_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/7/29/0/preview.jpg","acquisitionDate":"2016-07-29","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":35},{"sceneId":"20160527T093441_20160527T131812_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/5/27/0/preview.jpg","acquisitionDate":"2016-05-27","cloudCover":5.0229,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":28},{"sceneId":"20160729T094035_20160729T134414_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/7/29/0/preview.jpg","acquisitionDate":"2016-07-29","cloudCover":1.9006,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":35},{"sceneId":"20160626T093744_20160626T131738_T34TDM","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DM/2016/6/26/0/preview.jpg","acquisitionDate":"2016-06-26","cloudCover":22.2414,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":2}],"34TDN":[{"sceneId":"20160709T094034_20160709T132911_T34TDN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DN/2016/7/9/0/preview.jpg","acquisitionDate":"2016-07-09","cloudCover":7.7019,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":15},{"sceneId":"20160706T093337_20160706T131800_T34TDN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DN/2016/7/6/0/preview.jpg","acquisitionDate":"2016-07-06","cloudCover":12.3285,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":12},{"sceneId":"20160729T094035_20160729T134414_T34TDN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DN/2016/7/29/0/preview.jpg","acquisitionDate":"2016-07-29","cloudCover":2.96,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":35},{"sceneId":"20160805T093733_20160805T131813_T34TDN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DN/2016/8/5/0/preview.jpg","acquisitionDate":"2016-08-05","cloudCover":0.6567,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":42},{"sceneId":"20160527T093441_20160527T131812_T34TDN","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/DN/2016/5/27/0/preview.jpg","acquisitionDate":"2016-05-27","cloudCover":11.7288,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":28}],"34TEK":[{"sceneId":"20160616T093438_20160616T131744_T34TEK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/EK/2016/6/16/0/preview.jpg","acquisitionDate":"2016-06-16","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":8},{"sceneId":"20160703T092030_20160703T130848_T34TEK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/EK/2016/7/3/0/preview.jpg","acquisitionDate":"2016-07-03","cloudCover":1.7715,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":9},{"sceneId":"20160623T092257_20160623T130948_T34TEK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/EK/2016/6/23/0/preview.jpg","acquisitionDate":"2016-06-23","cloudCover":6.3607,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":1},{"sceneId":"20160713T092032_20160713T125925_T34TEK","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/EK/2016/7/13/0/preview.jpg","acquisitionDate":"2016-07-13","cloudCover":3.6145,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":19}],"34TEL":[{"sceneId":"20160616T093438_20160616T131744_T34TEL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/EL/2016/6/16/0/preview.jpg","acquisitionDate":"2016-06-16","cloudCover":0.0203,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":8},{"sceneId":"20160703T092030_20160703T130848_T34TEL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/EL/2016/7/3/0/preview.jpg","acquisitionDate":"2016-07-03","cloudCover":0.9417,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":9},{"sceneId":"20160623T092257_20160623T130948_T34TEL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/EL/2016/6/23/0/preview.jpg","acquisitionDate":"2016-06-23","cloudCover":7.8455,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":1},{"sceneId":"20160713T092032_20160713T125925_T34TEL","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/T/EL/2016/7/13/0/preview.jpg","acquisitionDate":"2016-07-13","cloudCover":3.4094,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":19}],"34SCJ":[{"sceneId":"20160626T093744_20160626T131738_T34SCJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/CJ/2016/6/26/0/preview.jpg","acquisitionDate":"2016-06-26","cloudCover":1.1798,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":2},{"sceneId":"20160629T094727_20160629T150301_T34SCJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/CJ/2016/6/29/0/preview.jpg","acquisitionDate":"2016-06-29","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":5},{"sceneId":"20160706T093337_20160706T131800_T34SCJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/CJ/2016/7/6/0/preview.jpg","acquisitionDate":"2016-07-06","cloudCover":0.0221,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":12}],"34SDJ":[{"sceneId":"20160623T092257_20160623T130948_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/6/23/0/preview.jpg","acquisitionDate":"2016-06-23","cloudCover":0.0544,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":1},{"sceneId":"20160703T092030_20160703T130848_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/7/3/0/preview.jpg","acquisitionDate":"2016-07-03","cloudCover":0.2945,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":9},{"sceneId":"20160616T093438_20160616T131744_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/6/16/0/preview.jpg","acquisitionDate":"2016-06-16","cloudCover":1.4815,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":8},{"sceneId":"20160706T093337_20160706T131800_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/7/6/0/preview.jpg","acquisitionDate":"2016-07-06","cloudCover":3.4542,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":12},{"sceneId":"20160713T092944_20160713T131239_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/7/13/0/preview.jpg","acquisitionDate":"2016-07-13","cloudCover":0.3845,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":19}]}'
                else
                    send '{"185_32":[{"sceneId":"LC81850322016239LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016239LGN00.jpg","acquisitionDate":"2016-08-26","cloudCover":29.43,"sunAzimuth":143.59432336,"sunElevation":54.9199678,"daysFromTargetDay":63},{"sceneId":"LC81850322016287LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016287LGN00.jpg","acquisitionDate":"2016-10-13","cloudCover":5.96,"sunAzimuth":158.84342655,"sunElevation":39.36680887,"daysFromTargetDay":111},{"sceneId":"LC81850322016271LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016271LGN00.jpg","acquisitionDate":"2016-09-27","cloudCover":35.38,"sunAzimuth":154.84572686,"sunElevation":44.85993927,"daysFromTargetDay":95},{"sceneId":"LC81850322016303LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016303LGN00.jpg","acquisitionDate":"2016-10-29","cloudCover":28.54,"sunAzimuth":161.43190429,"sunElevation":34.07472099,"daysFromTargetDay":127},{"sceneId":"LC81850322016255LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016255LGN00.jpg","acquisitionDate":"2016-09-11","cloudCover":74.35,"sunAzimuth":149.62059949,"sunElevation":50.14568036,"daysFromTargetDay":79},{"sceneId":"LC81850322016335LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016335LGN00.jpg","acquisitionDate":"2016-11-30","cloudCover":54.65,"sunAzimuth":162.39109648,"sunElevation":25.93675079,"daysFromTargetDay":159},{"sceneId":"LC81850322016351LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016351LGN00.jpg","acquisitionDate":"2016-12-16","cloudCover":55.38,"sunAzimuth":161.11671297,"sunElevation":23.96991901,"daysFromTargetDay":175},{"sceneId":"LC81850322016319LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016319LGN00.jpg","acquisitionDate":"2016-11-14","cloudCover":84.56,"sunAzimuth":162.57692444,"sunElevation":29.44111934,"daysFromTargetDay":143}],"187_31":[{"sceneId":"LC81870312016269LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/031/LC81870312016269LGN00.jpg","acquisitionDate":"2016-09-25","cloudCover":2.95,"sunAzimuth":155.34863406,"sunElevation":44.36202249,"daysFromTargetDay":93},{"sceneId":"LC81870312016237LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/031/LC81870312016237LGN00.jpg","acquisitionDate":"2016-08-24","cloudCover":24.06,"sunAzimuth":144.57633255,"sunElevation":54.47898562,"daysFromTargetDay":61},{"sceneId":"LC81870312016253LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/031/LC81870312016253LGN00.jpg","acquisitionDate":"2016-09-09","cloudCover":67.0,"sunAzimuth":150.29236508,"sunElevation":49.6805882,"daysFromTargetDay":77},{"sceneId":"LC81870312016349LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/031/LC81870312016349LGN00.jpg","acquisitionDate":"2016-12-14","cloudCover":20.49,"sunAzimuth":161.87090701,"sunElevation":22.85211493,"daysFromTargetDay":173},{"sceneId":"LC81870312016365LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/031/LC81870312016365LGN00.jpg","acquisitionDate":"2016-12-30","cloudCover":27.42,"sunAzimuth":159.93420229,"sunElevation":22.48375988,"daysFromTargetDay":176},{"sceneId":"LC81870312016333LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/031/LC81870312016333LGN00.jpg","acquisitionDate":"2016-11-28","cloudCover":42.08,"sunAzimuth":163.04756646,"sunElevation":25.01544728,"daysFromTargetDay":157},{"sceneId":"LC81870312016317LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/031/LC81870312016317LGN00.jpg","acquisitionDate":"2016-11-12","cloudCover":82.82,"sunAzimuth":163.13165021,"sunElevation":28.68295631,"daysFromTargetDay":141}],"186_31":[{"sceneId":"LC81860312016246LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016246LGN00.jpg","acquisitionDate":"2016-09-02","cloudCover":14.75,"sunAzimuth":147.83884679,"sunElevation":51.86016115,"daysFromTargetDay":70},{"sceneId":"LC81860312016262LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016262LGN00.jpg","acquisitionDate":"2016-09-18","cloudCover":35.11,"sunAzimuth":153.25269882,"sunElevation":46.73844898,"daysFromTargetDay":86},{"sceneId":"LC81860312016326LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":5.69,"sunAzimuth":163.23488684,"sunElevation":26.45837826,"daysFromTargetDay":150},{"sceneId":"LC81860312016342LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016342LGN00.jpg","acquisitionDate":"2016-12-07","cloudCover":5.02,"sunAzimuth":162.49750215,"sunElevation":23.59068804,"daysFromTargetDay":166},{"sceneId":"LC81860312016278LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016278LGN00.jpg","acquisitionDate":"2016-10-04","cloudCover":48.18,"sunAzimuth":157.71882145,"sunElevation":41.2477801,"daysFromTargetDay":102}],"185_31":[{"sceneId":"LC81850312016239LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/031/LC81850312016239LGN00.jpg","acquisitionDate":"2016-08-26","cloudCover":14.49,"sunAzimuth":145.30387208,"sunElevation":53.91849194,"daysFromTargetDay":63},{"sceneId":"LC81850312016271LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/031/LC81850312016271LGN00.jpg","acquisitionDate":"2016-09-27","cloudCover":9.21,"sunAzimuth":155.90666019,"sunElevation":43.6767893,"daysFromTargetDay":95},{"sceneId":"LC81850312016287LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/031/LC81850312016287LGN00.jpg","acquisitionDate":"2016-10-13","cloudCover":3.19,"sunAzimuth":159.69310094,"sunElevation":38.12895399,"daysFromTargetDay":111},{"sceneId":"LC81850312016303LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/031/LC81850312016303LGN00.jpg","acquisitionDate":"2016-10-29","cloudCover":0.33,"sunAzimuth":162.13679878,"sunElevation":32.80485752,"daysFromTargetDay":127}],"187_30":[{"sceneId":"LC81870302016269LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/030/LC81870302016269LGN00.jpg","acquisitionDate":"2016-09-25","cloudCover":23.42,"sunAzimuth":156.40770553,"sunElevation":43.17571685,"daysFromTargetDay":93},{"sceneId":"LC81870302016237LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/030/LC81870302016237LGN00.jpg","acquisitionDate":"2016-08-24","cloudCover":58.1,"sunAzimuth":146.26210107,"sunElevation":53.46453409,"daysFromTargetDay":61},{"sceneId":"LC81870302016253LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/030/LC81870302016253LGN00.jpg","acquisitionDate":"2016-09-09","cloudCover":85.38,"sunAzimuth":151.63101806,"sunElevation":48.57049626,"daysFromTargetDay":77},{"sceneId":"LC81870302016365LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/030/LC81870302016365LGN00.jpg","acquisitionDate":"2016-12-30","cloudCover":44.92,"sunAzimuth":160.48936902,"sunElevation":21.23725324,"daysFromTargetDay":176},{"sceneId":"LC81870302016349LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/030/LC81870302016349LGN00.jpg","acquisitionDate":"2016-12-14","cloudCover":48.84,"sunAzimuth":162.41406347,"sunElevation":21.58171738,"daysFromTargetDay":173},{"sceneId":"LC81870302016333LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/030/LC81870302016333LGN00.jpg","acquisitionDate":"2016-11-28","cloudCover":64.88,"sunAzimuth":163.61047795,"sunElevation":23.73014529,"daysFromTargetDay":157}],"186_30":[{"sceneId":"LC81860302016246LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016246LGN00.jpg","acquisitionDate":"2016-09-02","cloudCover":35.24,"sunAzimuth":149.32234548,"sunElevation":50.78974627,"daysFromTargetDay":70},{"sceneId":"LC81860302016262LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016262LGN00.jpg","acquisitionDate":"2016-09-18","cloudCover":42.7,"sunAzimuth":154.42493225,"sunElevation":45.58292926,"daysFromTargetDay":86},{"sceneId":"LC81860302016326LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":7.87,"sunAzimuth":163.81622137,"sunElevation":25.17122728,"daysFromTargetDay":150},{"sceneId":"LC81860302016294LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016294LGN00.jpg","acquisitionDate":"2016-10-20","cloudCover":55.15,"sunAzimuth":161.69823075,"sunElevation":34.48539449,"daysFromTargetDay":118},{"sceneId":"LC81860302016278LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016278LGN00.jpg","acquisitionDate":"2016-10-04","cloudCover":64.31,"sunAzimuth":158.65285507,"sunElevation":40.02845795,"daysFromTargetDay":102},{"sceneId":"LC81860302016358LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016358LGN00.jpg","acquisitionDate":"2016-12-23","cloudCover":40.24,"sunAzimuth":161.39848976,"sunElevation":21.15562939,"daysFromTargetDay":182},{"sceneId":"LC81860302016342LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016342LGN00.jpg","acquisitionDate":"2016-12-07","cloudCover":51.64,"sunAzimuth":163.04549905,"sunElevation":22.31218385,"daysFromTargetDay":166},{"sceneId":"LC81860302016310LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016310LGN00.jpg","acquisitionDate":"2016-11-05","cloudCover":73.37,"sunAzimuth":163.41278113,"sunElevation":29.37564365,"daysFromTargetDay":134}],"185_33":[{"sceneId":"LC81850332016239LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/033/LC81850332016239LGN00.jpg","acquisitionDate":"2016-08-26","cloudCover":1.92,"sunAzimuth":141.80722098,"sunElevation":55.89373986,"daysFromTargetDay":63},{"sceneId":"LC81850332016287LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/033/LC81850332016287LGN00.jpg","acquisitionDate":"2016-10-13","cloudCover":0.06,"sunAzimuth":157.9716826,"sunElevation":40.59595098,"daysFromTargetDay":111}],"186_32":[{"sceneId":"LC81860322016246LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016246LGN00.jpg","acquisitionDate":"2016-09-02","cloudCover":8.87,"sunAzimuth":146.29535127,"sunElevation":52.9085755,"daysFromTargetDay":70},{"sceneId":"LC81860322016262LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016262LGN00.jpg","acquisitionDate":"2016-09-18","cloudCover":35.3,"sunAzimuth":152.03945007,"sunElevation":47.88002896,"daysFromTargetDay":86},{"sceneId":"LC81860322016310LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016310LGN00.jpg","acquisitionDate":"2016-11-05","cloudCover":12.23,"sunAzimuth":162.10359277,"sunElevation":31.93549331,"daysFromTargetDay":134},{"sceneId":"LC81860322016326LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":4.2,"sunAzimuth":162.64845679,"sunElevation":27.7421774,"daysFromTargetDay":150},{"sceneId":"LC81860322016278LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016278LGN00.jpg","acquisitionDate":"2016-10-04","cloudCover":39.1,"sunAzimuth":156.7596602,"sunElevation":42.45747045,"daysFromTargetDay":102}]}'
//                    send '{"185_32":[{"sceneId":"LC81850322016287LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016287LGN00.jpg","acquisitionDate":"2016-10-13","cloudCover":5.96,"sunAzimuth":158.84342655,"sunElevation":39.36680887,"daysFromTargetDay":50},{"sceneId":"LE71850322016023NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/32/2016/LE71850322016023NSG00_REFL.jpg","acquisitionDate":"2016-01-23","cloudCover":10.93,"sunAzimuth":156.32223511,"sunElevation":26.60946465,"daysFromTargetDay":51},{"sceneId":"LE71850322016327NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/32/2016/LE71850322016327NSG00_REFL.jpg","acquisitionDate":"2016-11-22","cloudCover":38.39,"sunAzimuth":163.16265869,"sunElevation":27.63088226,"daysFromTargetDay":10},{"sceneId":"LC81850322016303LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016303LGN00.jpg","acquisitionDate":"2016-10-29","cloudCover":28.54,"sunAzimuth":161.43190429,"sunElevation":34.07472099,"daysFromTargetDay":34},{"sceneId":"LC81850322016031LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/032/LC81850322016031LGN00.jpg","acquisitionDate":"2016-01-31","cloudCover":18.85,"sunAzimuth":154.71089498,"sunElevation":28.26608719,"daysFromTargetDay":59},{"sceneId":"LE71850322016279NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/32/2016/LE71850322016279NSG00_REFL.jpg","acquisitionDate":"2016-10-05","cloudCover":20.83,"sunAzimuth":157.74961853,"sunElevation":42.28244781,"daysFromTargetDay":58}],"187_31":[{"sceneId":"LE71870312016037NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/31/2016/LE71870312016037NSG00_REFL.jpg","acquisitionDate":"2016-02-06","cloudCover":0.2,"sunAzimuth":155.04808044,"sunElevation":28.84342957,"daysFromTargetDay":65},{"sceneId":"LE71870312016277NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/31/2016/LE71870312016277NSG00_REFL.jpg","acquisitionDate":"2016-10-03","cloudCover":5.78,"sunAzimuth":158.21365356,"sunElevation":41.75606537,"daysFromTargetDay":60},{"sceneId":"LC81870312016269LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/031/LC81870312016269LGN00.jpg","acquisitionDate":"2016-09-25","cloudCover":2.95,"sunAzimuth":155.34863406,"sunElevation":44.36202249,"daysFromTargetDay":68}],"186_31":[{"sceneId":"LC81860312016326LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":5.69,"sunAzimuth":163.23488684,"sunElevation":26.45837826,"daysFromTargetDay":11},{"sceneId":"LE71860312016030NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016030NSG00_REFL.jpg","acquisitionDate":"2016-01-30","cloudCover":4.47,"sunAzimuth":155.98269653,"sunElevation":26.98164558,"daysFromTargetDay":58},{"sceneId":"LC81860312016022LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016022LGN00.jpg","acquisitionDate":"2016-01-22","cloudCover":9.82,"sunAzimuth":156.69346639,"sunElevation":25.08324978,"daysFromTargetDay":50},{"sceneId":"LC81860312016038LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016038LGN00.jpg","acquisitionDate":"2016-02-07","cloudCover":5.73,"sunAzimuth":154.42462931,"sunElevation":28.97381115,"daysFromTargetDay":66}],"185_31":[{"sceneId":"LC81850312016303LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/031/LC81850312016303LGN00.jpg","acquisitionDate":"2016-10-29","cloudCover":0.33,"sunAzimuth":162.13679878,"sunElevation":32.80485752,"daysFromTargetDay":34},{"sceneId":"LC81850312016287LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/031/LC81850312016287LGN00.jpg","acquisitionDate":"2016-10-13","cloudCover":3.19,"sunAzimuth":159.69310094,"sunElevation":38.12895399,"daysFromTargetDay":50},{"sceneId":"LE71850312016023NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/31/2016/LE71850312016023NSG00_REFL.jpg","acquisitionDate":"2016-01-23","cloudCover":9.56,"sunAzimuth":156.95932007,"sunElevation":25.40877914,"daysFromTargetDay":51}],"187_30":[{"sceneId":"LE71870302016037NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/30/2016/LE71870302016037NSG00_REFL.jpg","acquisitionDate":"2016-02-06","cloudCover":7.36,"sunAzimuth":155.75964355,"sunElevation":27.6642189,"daysFromTargetDay":65},{"sceneId":"LE71870302016325NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/30/2016/LE71870302016325NSG00_REFL.jpg","acquisitionDate":"2016-11-20","cloudCover":50.19,"sunAzimuth":164.34642029,"sunElevation":25.49570656,"daysFromTargetDay":12},{"sceneId":"LC81870302016269LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/187/030/LC81870302016269LGN00.jpg","acquisitionDate":"2016-09-25","cloudCover":23.42,"sunAzimuth":156.40770553,"sunElevation":43.17571685,"daysFromTargetDay":68},{"sceneId":"LE71870302016229NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/30/2016/LE71870302016229NSG00_REFL.jpg","acquisitionDate":"2016-08-16","cloudCover":4.4,"sunAzimuth":144.52908325,"sunElevation":55.93079376,"daysFromTargetDay":108},{"sceneId":"LE71870302016213NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/187/30/2016/LE71870302016213NSG00_REFL.jpg","acquisitionDate":"2016-07-31","cloudCover":0.09,"sunAzimuth":139.64707947,"sunElevation":59.72838593,"daysFromTargetDay":124}],"186_30":[{"sceneId":"LC81860302016326LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":7.87,"sunAzimuth":163.81622137,"sunElevation":25.17122728,"daysFromTargetDay":11},{"sceneId":"LE71860302016030NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/30/2016/LE71860302016030NSG00_REFL.jpg","acquisitionDate":"2016-01-30","cloudCover":17.82,"sunAzimuth":156.65101624,"sunElevation":25.78956032,"daysFromTargetDay":58},{"sceneId":"LC81860302016038LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/030/LC81860302016038LGN00.jpg","acquisitionDate":"2016-02-07","cloudCover":22.48,"sunAzimuth":155.1453536,"sunElevation":27.80351697,"daysFromTargetDay":66},{"sceneId":"LE71860302016078NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/30/2016/LE71860302016078NSG00_REFL.jpg","acquisitionDate":"2016-03-18","cloudCover":0.52,"sunAzimuth":151.54496765,"sunElevation":42.37598419,"daysFromTargetDay":106}],"185_33":[{"sceneId":"LE71850332016327NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/185/33/2016/LE71850332016327NSG00_REFL.jpg","acquisitionDate":"2016-11-22","cloudCover":9.03,"sunAzimuth":162.57658386,"sunElevation":28.91710091,"daysFromTargetDay":10},{"sceneId":"LC81850332016287LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/185/033/LC81850332016287LGN00.jpg","acquisitionDate":"2016-10-13","cloudCover":0.06,"sunAzimuth":157.9716826,"sunElevation":40.59595098,"daysFromTargetDay":50}],"186_32":[{"sceneId":"LC81860322016326LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":4.2,"sunAzimuth":162.64845679,"sunElevation":27.7421774,"daysFromTargetDay":11},{"sceneId":"LC81860322016310LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016310LGN00.jpg","acquisitionDate":"2016-11-05","cloudCover":12.23,"sunAzimuth":162.10359277,"sunElevation":31.93549331,"daysFromTargetDay":27},{"sceneId":"LC81860322016022LGN00","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/032/LC81860322016022LGN00.jpg","acquisitionDate":"2016-01-22","cloudCover":9.24,"sunAzimuth":156.05980205,"sunElevation":26.28084328,"daysFromTargetDay":50},{"sceneId":"LE71860322016014NSG00","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/32/2016/LE71860322016014NSG00_REFL.jpg","acquisitionDate":"2016-01-14","cloudCover":15.06,"sunAzimuth":157.64157104,"sunElevation":25.07288361,"daysFromTargetDay":42}]}'
            }


            get('/api/data/sceneareas/{sceneAreaId}') {
                response.contentType = 'application/json'

                params.targetDay //MM-dd
                params.fromDate //YYYY-MM-dd
                params.toDate  //YYYY-MM-dd
                if (params.dataSet == 'SENTINEL2')
                    send '[{"sceneId":"20160118T094814_20160118T133301_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/1/18/0/preview.jpg","acquisitionDate":"2016-01-18","cloudCover":6.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":158},{"sceneId":"20160125T093752_20160125T132659_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/1/25/0/preview.jpg","acquisitionDate":"2016-01-25","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":151},{"sceneId":"20160217T093845_20160217T150922_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/2/17/0/preview.jpg","acquisitionDate":"2016-02-17","cloudCover":99.7019,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":128},{"sceneId":"20160308T093139_20160308T165710_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/3/8/0/preview.jpg","acquisitionDate":"2016-03-08","cloudCover":45.7235,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":108},{"sceneId":"20160315T092205_20160315T164650_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/3/15/0/preview.jpg","acquisitionDate":"2016-03-15","cloudCover":94.4511,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":101},{"sceneId":"20160318T093552_20160318T165818_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/3/18/0/preview.jpg","acquisitionDate":"2016-03-18","cloudCover":99.8081,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":98},{"sceneId":"20160325T092405_20160325T150955_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/3/25/0/preview.jpg","acquisitionDate":"2016-03-25","cloudCover":57.3881,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":91},{"sceneId":"20160328T093427_20160328T151411_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/3/28/0/preview.jpg","acquisitionDate":"2016-03-28","cloudCover":72.3908,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":88},{"sceneId":"20160404T092409_20160404T132741_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/4/4/0/preview.jpg","acquisitionDate":"2016-04-04","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":81},{"sceneId":"20160407T093733_20160407T131800_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/4/7/0/preview.jpg","acquisitionDate":"2016-04-07","cloudCover":92.7374,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":78},{"sceneId":"20160414T092451_20160414T132718_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/4/14/0/preview.jpg","acquisitionDate":"2016-04-14","cloudCover":0.0163,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":71},{"sceneId":"20160424T092523_20160424T132255_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/4/24/0/preview.jpg","acquisitionDate":"2016-04-24","cloudCover":71.5825,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":61},{"sceneId":"20160427T093037_20160427T133230_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/4/27/0/preview.jpg","acquisitionDate":"2016-04-27","cloudCover":40.7909,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":58},{"sceneId":"20160507T093133_20160507T131907_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/5/7/0/preview.jpg","acquisitionDate":"2016-05-07","cloudCover":4.9804,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":48},{"sceneId":"20160514T092034_20160514T130933_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/5/14/0/preview.jpg","acquisitionDate":"2016-05-14","cloudCover":11.824,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":41},{"sceneId":"20160524T092034_20160527T030852_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/5/24/0/preview.jpg","acquisitionDate":"2016-05-24","cloudCover":22.2839,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":31},{"sceneId":"20160527T093441_20160527T131812_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/5/27/0/preview.jpg","acquisitionDate":"2016-05-27","cloudCover":0.0062,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":28},{"sceneId":"20160616T093438_20160616T131744_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/6/16/0/preview.jpg","acquisitionDate":"2016-06-16","cloudCover":1.4815,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":8},{"sceneId":"20160623T092257_20160623T130948_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/6/23/0/preview.jpg","acquisitionDate":"2016-06-23","cloudCover":0.0544,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":1},{"sceneId":"20160626T093744_20160626T131738_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/6/26/0/preview.jpg","acquisitionDate":"2016-06-26","cloudCover":36.3429,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":2},{"sceneId":"20160703T092030_20160703T130848_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/7/3/0/preview.jpg","acquisitionDate":"2016-07-03","cloudCover":0.2945,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":9},{"sceneId":"20160706T093337_20160706T131800_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/7/6/0/preview.jpg","acquisitionDate":"2016-07-06","cloudCover":3.4542,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":12},{"sceneId":"20160713T092032_20160713T125925_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/7/13/0/preview.jpg","acquisitionDate":"2016-07-13","cloudCover":2.857,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":19},{"sceneId":"20160713T092944_20160713T131239_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/7/13/0/preview.jpg","acquisitionDate":"2016-07-13","cloudCover":0.3845,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":19},{"sceneId":"20160723T092032_20160723T130751_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/7/23/0/preview.jpg","acquisitionDate":"2016-07-23","cloudCover":0.0026,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":29},{"sceneId":"20160726T093859_20160726T150012_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/7/26/0/preview.jpg","acquisitionDate":"2016-07-26","cloudCover":7.4631,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":32},{"sceneId":"20160802T092705_20160802T132315_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/8/2/0/preview.jpg","acquisitionDate":"2016-08-02","cloudCover":0.1649,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":39},{"sceneId":"20160805T093733_20160805T131813_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/8/5/0/preview.jpg","acquisitionDate":"2016-08-05","cloudCover":2.8208,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":42},{"sceneId":"20160812T092032_20160812T131202_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/8/12/0/preview.jpg","acquisitionDate":"2016-08-12","cloudCover":0.4576,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":49},{"sceneId":"20160815T093042_20160815T131839_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/8/15/0/preview.jpg","acquisitionDate":"2016-08-15","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":52},{"sceneId":"20160822T092032_20160822T130934_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/8/22/0/preview.jpg","acquisitionDate":"2016-08-22","cloudCover":1.2866,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":59},{"sceneId":"20160825T093032_20160825T132040_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/8/25/0/preview.jpg","acquisitionDate":"2016-08-25","cloudCover":59.2562,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":62},{"sceneId":"20160911T092032_20160911T131018_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/9/11/0/preview.jpg","acquisitionDate":"2016-09-11","cloudCover":60.7194,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":79},{"sceneId":"20160914T093032_20160914T131922_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/9/14/0/preview.jpg","acquisitionDate":"2016-09-14","cloudCover":10.0278,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":82},{"sceneId":"20160921T092022_20160921T131832_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/9/21/0/preview.jpg","acquisitionDate":"2016-09-21","cloudCover":70.5193,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":89},{"sceneId":"20160924T093032_20160924T131755_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/9/24/0/preview.jpg","acquisitionDate":"2016-09-24","cloudCover":50.4408,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":92},{"sceneId":"20161001T092022_20161001T130226_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/10/1/0/preview.jpg","acquisitionDate":"2016-10-01","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":99},{"sceneId":"20161004T093032_20161004T132003_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/10/4/0/preview.jpg","acquisitionDate":"2016-10-04","cloudCover":2.9742,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":102},{"sceneId":"20161021T092022_20161021T131026_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/10/21/0/preview.jpg","acquisitionDate":"2016-10-21","cloudCover":100.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":119},{"sceneId":"20161024T093042_20161024T132151_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/10/24/0/preview.jpg","acquisitionDate":"2016-10-24","cloudCover":1.0882,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":122},{"sceneId":"20161031T092122_20161031T131036_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/10/31/0/preview.jpg","acquisitionDate":"2016-10-31","cloudCover":11.0384,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":129},{"sceneId":"20161103T093142_20161103T131832_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/11/3/0/preview.jpg","acquisitionDate":"2016-11-03","cloudCover":71.9314,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":132},{"sceneId":"20161110T092212_20161110T131713_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/11/10/0/preview.jpg","acquisitionDate":"2016-11-10","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":139},{"sceneId":"20161113T093232_20161113T132031_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/11/13/0/preview.jpg","acquisitionDate":"2016-11-13","cloudCover":20.0087,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":142},{"sceneId":"20161120T092302_20161120T130938_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/11/20/0/preview.jpg","acquisitionDate":"2016-11-20","cloudCover":59.808,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":149},{"sceneId":"20161123T093322_20161123T131849_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/11/23/0/preview.jpg","acquisitionDate":"2016-11-23","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":152},{"sceneId":"20161130T092342_20161130T112616_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/11/30/0/preview.jpg","acquisitionDate":"2016-11-30","cloudCover":62.2629,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":159},{"sceneId":"20161203T093352_20161203T132207_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/12/3/0/preview.jpg","acquisitionDate":"2016-12-03","cloudCover":32.8524,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":162},{"sceneId":"20161210T092402_20161210T092356_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/12/10/0/preview.jpg","acquisitionDate":"2016-12-10","cloudCover":0.1391,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":169},{"sceneId":"20161213T093402_20161213T093819_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/12/13/0/preview.jpg","acquisitionDate":"2016-12-13","cloudCover":0.4446,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":172},{"sceneId":"20161220T092402_20161220T092404_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/12/20/0/preview.jpg","acquisitionDate":"2016-12-20","cloudCover":92.4833,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":179},{"sceneId":"20161223T093412_20161223T093656_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/12/23/0/preview.jpg","acquisitionDate":"2016-12-23","cloudCover":0.0,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":182},{"sceneId":"20161230T092402_20161230T092752_T34SDJ","dataSet":"SENTINEL2","sensor":"SENTINEL2A","browseUrl":"http://sentinel-s2-l1c.s3.amazonaws.com/tiles/34/S/DJ/2016/12/30/0/preview.jpg","acquisitionDate":"2016-12-30","cloudCover":2.8501,"sunAzimuth":0.0,"sunElevation":0.0,"daysFromTargetDay":176}]'
                else
                    send '[{"sceneId":"LE71860312016014NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016014NSG00_REFL.jpg","acquisitionDate":"2016-01-14","cloudCover":64.95,"sunAzimuth":158.23950195,"sunElevation":23.85348129,"daysFromTargetDay":162},{"sceneId":"LE71860312016030NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016030NSG00_REFL.jpg","acquisitionDate":"2016-01-30","cloudCover":26.47,"sunAzimuth":155.98269653,"sunElevation":26.98164558,"daysFromTargetDay":146},{"sceneId":"LE71860312016046NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016046NSG00_REFL.jpg","acquisitionDate":"2016-02-15","cloudCover":87.85,"sunAzimuth":153.91433716,"sunElevation":31.59731865,"daysFromTargetDay":130},{"sceneId":"LE71860312016062NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016062NSG00_REFL.jpg","acquisitionDate":"2016-03-02","cloudCover":83.5,"sunAzimuth":152.09802246,"sunElevation":37.26567078,"daysFromTargetDay":114},{"sceneId":"LE71860312016078NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016078NSG00_REFL.jpg","acquisitionDate":"2016-03-18","cloudCover":67.28999999999999,"sunAzimuth":150.41763306,"sunElevation":43.48612976,"daysFromTargetDay":98},{"sceneId":"LE71860312016094NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016094NSG00_REFL.jpg","acquisitionDate":"2016-04-03","cloudCover":22.94,"sunAzimuth":148.58911133,"sunElevation":49.73440552,"daysFromTargetDay":82},{"sceneId":"LE71860312016110NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016110NSG00_REFL.jpg","acquisitionDate":"2016-04-19","cloudCover":92.15,"sunAzimuth":146.22406006,"sunElevation":55.49356461,"daysFromTargetDay":66},{"sceneId":"LE71860312016126NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016126NSG00_REFL.jpg","acquisitionDate":"2016-05-05","cloudCover":61.68,"sunAzimuth":142.98631287,"sunElevation":60.27190781,"daysFromTargetDay":50},{"sceneId":"LE71860312016158NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016158NSG00_REFL.jpg","acquisitionDate":"2016-06-06","cloudCover":64.4,"sunAzimuth":134.94534302,"sunElevation":65.40193939,"daysFromTargetDay":18},{"sceneId":"LE71860312016174NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016174NSG00_REFL.jpg","acquisitionDate":"2016-06-22","cloudCover":35.69,"sunAzimuth":132.47532654,"sunElevation":65.54254913,"daysFromTargetDay":2},{"sceneId":"LE71860312016190NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016190NSG00_REFL.jpg","acquisitionDate":"2016-07-08","cloudCover":22.42,"sunAzimuth":132.62864685,"sunElevation":64.30789948,"daysFromTargetDay":14},{"sceneId":"LE71860312016206NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016206NSG00_REFL.jpg","acquisitionDate":"2016-07-24","cloudCover":28.13,"sunAzimuth":135.4697876,"sunElevation":61.95013046,"daysFromTargetDay":30},{"sceneId":"LE71860312016222NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016222NSG00_REFL.jpg","acquisitionDate":"2016-08-09","cloudCover":42.78,"sunAzimuth":140.23428345,"sunElevation":58.63602066,"daysFromTargetDay":46},{"sceneId":"LE71860312016238NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016238NSG00_REFL.jpg","acquisitionDate":"2016-08-25","cloudCover":46.66,"sunAzimuth":145.88632202,"sunElevation":54.47178268,"daysFromTargetDay":62},{"sceneId":"LC81860312016246LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016246LGN00.jpg","acquisitionDate":"2016-09-02","cloudCover":14.75,"sunAzimuth":147.83884679,"sunElevation":51.86016115,"daysFromTargetDay":70},{"sceneId":"LC81860312016262LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016262LGN00.jpg","acquisitionDate":"2016-09-18","cloudCover":35.11,"sunAzimuth":153.25269882,"sunElevation":46.73844898,"daysFromTargetDay":86},{"sceneId":"LE71860312016270NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016270NSG00_REFL.jpg","acquisitionDate":"2016-09-26","cloudCover":37.93,"sunAzimuth":156.40458679,"sunElevation":44.19863892,"daysFromTargetDay":94},{"sceneId":"LC81860312016278LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016278LGN00.jpg","acquisitionDate":"2016-10-04","cloudCover":48.18,"sunAzimuth":157.71882145,"sunElevation":41.2477801,"daysFromTargetDay":102},{"sceneId":"LC81860312016294LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016294LGN00.jpg","acquisitionDate":"2016-10-20","cloudCover":49.93,"sunAzimuth":160.9345213,"sunElevation":35.74581085,"daysFromTargetDay":118},{"sceneId":"LE71860312016302NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016302NSG00_REFL.jpg","acquisitionDate":"2016-10-28","cloudCover":69.64,"sunAzimuth":162.63502502,"sunElevation":33.23833084,"daysFromTargetDay":126},{"sceneId":"LC81860312016310LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016310LGN00.jpg","acquisitionDate":"2016-11-05","cloudCover":55.0,"sunAzimuth":162.76241935,"sunElevation":30.65781768,"daysFromTargetDay":134},{"sceneId":"LE71860312016318NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016318NSG00_REFL.jpg","acquisitionDate":"2016-11-13","cloudCover":81.07,"sunAzimuth":163.7116394,"sunElevation":28.52453804,"daysFromTargetDay":142},{"sceneId":"LC81860312016326LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016326LGN00.jpg","acquisitionDate":"2016-11-21","cloudCover":5.69,"sunAzimuth":163.23488684,"sunElevation":26.45837826,"daysFromTargetDay":150},{"sceneId":"LE71860312016334NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016334NSG00_REFL.jpg","acquisitionDate":"2016-11-29","cloudCover":75.78999999999999,"sunAzimuth":163.5057373,"sunElevation":24.93937683,"daysFromTargetDay":158},{"sceneId":"LC81860312016342LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016342LGN00.jpg","acquisitionDate":"2016-12-07","cloudCover":5.02,"sunAzimuth":162.49750215,"sunElevation":23.59068804,"daysFromTargetDay":166},{"sceneId":"LC81860312016358LGN00","dataSet":"LANDSAT","sensor":"LANDSAT_8","browseUrl":"http://earthexplorer.usgs.gov/browse/landsat_8/2016/186/031/LC81860312016358LGN00.jpg","acquisitionDate":"2016-12-23","cloudCover":7.57,"sunAzimuth":160.85239905,"sunElevation":22.41379639,"daysFromTargetDay":182},{"sceneId":"LE71860312016366NSG00","dataSet":"LANDSAT","sensor":"LANDSAT_ETM_SLC_OFF","browseUrl":"http://earthexplorer.usgs.gov/browse/etm/186/31/2016/LE71860312016366NSG00_REFL.jpg","acquisitionDate":"2016-12-31","cloudCover":51.92,"sunAzimuth":160.26966858,"sunElevation":22.65183067,"daysFromTargetDay":175}]'
//                send toJson([
//                        [sceneId: 'LC81900302015079LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015079LGN00.jpg', acquisitionDate: '2015-03-20', cloudCover: 0.08, sunAzimuth: 150.48942477, sunElevation: 42.80026465, daysFromTargetDay: 5],
//                        [sceneId: 'LC81900302015079LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015079LGN00.jpg', acquisitionDate: '2015-03-20', cloudCover: 0.08, sunAzimuth: 150.48942477, sunElevation: 42.80026465, daysFromTargetDay: 50],
//                        [sceneId: 'LE71900302015183NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015183NSG00.jpg', acquisitionDate: '2015-07-02', cloudCover: 0.09, sunAzimuth: 133.80200195, sunElevation: 63.82229996, daysFromTargetDay: 100],
//                        [sceneId: 'LE71900302015183NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015183NSG00.jpg', acquisitionDate: '2015-07-02', cloudCover: 0.09, sunAzimuth: 133.80200195, sunElevation: 63.82229996, daysFromTargetDay: 0],
//                        [sceneId: 'LE71900302015199NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015199NSG00.jpg', acquisitionDate: '2015-07-18', cloudCover: 0.1, sunAzimuth: 135.36825562, sunElevation: 61.8910408, daysFromTargetDay: 120],
//                        [sceneId: 'LE71900302015199NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015199NSG00.jpg', acquisitionDate: '2015-07-18', cloudCover: 0.1, sunAzimuth: 135.36825562, sunElevation: 61.8910408, daysFromTargetDay: 1],
//                        [sceneId: 'LE71900302016106NSG00', sensor: 'LANDSAT_ETM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016106NSG00.jpg', acquisitionDate: '2016-04-15', cloudCover: 0.34, sunAzimuth: 148.4969635, sunElevation: 53.07840347, daysFromTargetDay: 6],
//                        [sceneId: 'LE71900302016106NSG00', sensor: 'LANDSAT_ETM_SLC_OFF', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016106NSG00.jpg', acquisitionDate: '2016-04-15', cloudCover: 0.34, sunAzimuth: 148.4969635, sunElevation: 53.07840347, daysFromTargetDay: 4],
//                        [sceneId: 'LE71900302015311NSG00', sensor: 'LANDSAT_ETM_SLC_OFF', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015311NSG00.jpg', acquisitionDate: '2015-11-07', cloudCover: 0.47, sunAzimuth: 163.56713867, sunElevation: 29.02179146, daysFromTargetDay: 4],
//                        [sceneId: 'LE71900302015103NSG00', sensor: 'LANDSAT_ETM_SLC_OFF', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015103NSG00.jpg', acquisitionDate: '2015-04-13', cloudCover: 0.47, sunAzimuth: 147.74519348, sunElevation: 51.80644989, daysFromTargetDay: 4],
//                        [sceneId: 'LE71900302015103NSG00', sensor: 'LANDSAT_ETM_SLC_OFF', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015103NSG00.jpg', acquisitionDate: '2015-04-13', cloudCover: 0.47, sunAzimuth: 147.74519348, sunElevation: 51.80644989, daysFromTargetDay: 5],
//                        [sceneId: 'LE71900302015311NSG00', sensor: 'LANDSAT_TM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2015/LE71900302015311NSG00.jpg', acquisitionDate: '2015-11-07', cloudCover: 0.47, sunAzimuth: 163.56713867, sunElevation: 29.02179146, daysFromTargetDay: 101],
//                        [sceneId: 'LE71900302016026NSG00', sensor: 'LANDSAT_TM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016026NSG00.jpg', acquisitionDate: '2016-01-26', cloudCover: 1.02, sunAzimuth: 157.18023682, sunElevation: 24.84968567, daysFromTargetDay: 99],
//                        [sceneId: 'LE71900302016026NSG00', sensor: 'LANDSAT_TM', browseUrl: 'http://earthexplorer.usgs.gov/browse/etm/190/30/2016/LE71900302016026NSG00.jpg', acquisitionDate: '2016-01-26', cloudCover: 1.02, sunAzimuth: 157.18023682, sunElevation: 24.84968567, daysFromTargetDay: 52],
//                        [sceneId: 'LC81900302015111LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015111LGN00.jpg', acquisitionDate: '2015-04-21', cloudCover: 1.4, sunAzimuth: 146.37338078, sunElevation: 54.70757449, daysFromTargetDay: 23],
//                        [sceneId: 'LC81900302015111LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015111LGN00.jpg', acquisitionDate: '2015-04-21', cloudCover: 1.4, sunAzimuth: 146.37338078, sunElevation: 54.70757449, daysFromTargetDay: 5],
//                        [sceneId: 'LC81900302015191LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015191LGN00.jpg', acquisitionDate: '2015-07-10', cloudCover: 1.76, sunAzimuth: 134.20303675, sunElevation: 62.96916492, daysFromTargetDay: 54],
//                        [sceneId: 'LC81900302015191LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015191LGN00.jpg', acquisitionDate: '2015-07-10', cloudCover: 1.76, sunAzimuth: 134.20303675, sunElevation: 62.96916492, daysFromTargetDay: 1],
//                        [sceneId: 'LC81900302015015LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015015LGN00.jpg', acquisitionDate: '2015-01-15', cloudCover: 1.85, sunAzimuth: 158.23985381, sunElevation: 22.88232301, daysFromTargetDay: 58],
//                        [sceneId: 'LC81900302015015LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015015LGN00.jpg', acquisitionDate: '2015-01-15', cloudCover: 1.85, sunAzimuth: 158.23985381, sunElevation: 22.88232301, daysFromTargetDay: 129],
//                        [sceneId: 'LC81900302015239LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015239LGN00.jpg', acquisitionDate: '2015-08-27', cloudCover: 2.28, sunAzimuth: 146.90510045, sunElevation: 52.77744787, daysFromTargetDay: 21],
//                        [sceneId: 'LC81900302015239LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015239LGN00.jpg', acquisitionDate: '2015-08-27', cloudCover: 2.28, sunAzimuth: 146.90510045, sunElevation: 52.77744787, daysFromTargetDay: 62],
//                        [sceneId: 'LC81900302015127LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015127LGN00.jpg', acquisitionDate: '2015-05-07', cloudCover: 2.78, sunAzimuth: 143.40108505, sunElevation: 59.2340895, daysFromTargetDay: 144],
//                        [sceneId: 'LC81900302015127LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2015/190/030/LC81900302015127LGN00.jpg', acquisitionDate: '2015-05-07', cloudCover: 2.78, sunAzimuth: 143.40108505, sunElevation: 59.2340895, daysFromTargetDay: 11],
//                        [sceneId: 'LC81900302016050LGN00', sensor: 'LANDSAT_8', browseUrl: 'http://earthexplorer.usgs.gov/browse/landsat_8/2016/190/030/LC81900302016050LGN00.jpg', acquisitionDate: '2016-02-19', cloudCover: 2.98, sunAzimuth: 153.68447136, sunElevation: 31.61607965, daysFromTargetDay: 64]
//                ])
            }

            post('/api/data/mosaic/preview') {
                response.contentType = "application/json"
                def dataSet = params['dataSet'] as DataSet ?: DataSet.LANDSAT
                def sceneIds = params.required('sceneIds', String).split(',')*.trim()
                def bands = params.required('bands', String).split(',')*.trim()
                def targetDayOfYear = params.required('targetDayOfYear', int)
                def targetDayOfYearWeight = params.required('targetDayOfYearWeight', double)

                def geeGateway = new HttpGoogleEarthEngineGateway('http://localhost:5001')
                def mapLayer = geeGateway.preview(new PreselectedScenesMapQuery(
                        dataSet: dataSet,
                        sceneIds: sceneIds,
                        aoi: toAoi(params),
                        targetDayOfYear: targetDayOfYear,
                        targetDayOfYearWeight: targetDayOfYearWeight,
                        bands: bands
                ))

                send(toJson(
                        mapId: mapLayer.id,
                        token: mapLayer.token
                ))
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
            post('/user/send-invitation') {
                def username = params.required('username', String)
                println "Sending intiation to user with username $username"

                // TODO: Use username instead of ID
                response.contentType = 'application/json'
                send toJson([status: 'success', message: 'Invitation sent'])
            }

            get('/api/data/google-maps-api-key') {
                response.contentType = 'application/json'
                send toJson(apiKey: 'AIzaSyAIi2lE7w25HZOrJkWT-qHH01W-ywyrC0U')
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
                        "label": "GEO Processing ",
                        "apps": [
                          {
                            "label": "GEO Processing - BETA",
                            "path": "/sandbox/shiny/geo-processing"
                          },
                          {
                            "label": "Visualize - BETA",
                            "path": "/sandbox/shiny/visualize"
                          },
                          {
                            "label": "SAR Toolkit",
                            "path": "/sandbox/shiny/osk"
                          }
                        ]
                      },
                      {
                        "label": "Accuracy Assessment Design",
                        "path": "/sandbox/shiny/accuracy-assessment/aa_design"
                      },
                      {
                        "label": "Accuracy Assessment Analysis",
                        "path": "/sandbox/shiny/accuracy-assessment/aa_analysis"
                      }
                    ]'''
            }

            boolean sandboxServerUp = true
            // visualization - sandbox apis
            post('/sandbox/start') {
                response.contentType = 'application/json'
                params.endpoint // Either rstudio, geo-web-viz, or shiny
                if (sandboxServerUp)
                    send toJson([status: 'STARTED'])
                else
                    send toJson([status: 'STARTING'])
            }

            get('/sandbox/**') {
                while (!sandboxServerUp)
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

    private fromJson(String json) {
        new JsonSlurper().parseText(json)
    }

    private Aoi toAoi(Params params) {
        def polygon = params.polygon as String
        def aoi = polygon ?
                new Polygon(new JsonSlurper().parseText(polygon) as List) :
                new FusionTableShape(
                        tableName: FUSION_TABLE,
                        keyColumn: KEY_COLUMN,
                        keyValue: params.required('countryIso', String))
        return aoi
    }

    static void main(String[] args) {
        new ResourceServer(9999, '/', new MockServer()).start()
    }

}
