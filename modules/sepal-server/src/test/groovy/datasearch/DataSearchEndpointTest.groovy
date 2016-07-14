package datasearch

import groovymvc.Controller
import org.openforis.sepal.component.datasearch.LatLng
import org.openforis.sepal.component.datasearch.Polygon
import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.SceneMetaData
import org.openforis.sepal.component.datasearch.api.GoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.api.SceneQuery
import org.openforis.sepal.component.datasearch.endpoint.DataSearchEndpoint
import org.openforis.sepal.component.datasearch.query.FindBestScenes
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoi
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneArea
import org.openforis.sepal.util.DateTime
import util.AbstractEndpointTest

import static org.openforis.sepal.component.datasearch.MetaDataSource.USGS
import static org.openforis.sepal.util.DateTime.parseDateString
import static org.openforis.sepal.util.DateTime.toDateTimeString

@SuppressWarnings("GroovyAssignabilityCheck")
class DataSearchEndpointTest extends AbstractEndpointTest {
    def geeGateway = Mock GoogleEarthEngineGateway

    void registerEndpoint(Controller controller) {
        new DataSearchEndpoint(queryDispatcher, commandDispatcher, geeGateway).registerWith(controller)
    }

    def 'GET /data/sceneareas/?countryIso= returns sceneareas'() {
        when:
        def response = get(path: 'data/sceneareas', query: [countryIso: 'aa'])

        then:
        1 * queryDispatcher.submit({ it.aoi.keyValue == 'aa' } as FindSceneAreasForAoi) >> [
                new SceneArea(
                        id: 'scene area id',
                        polygon: new Polygon([new LatLng(1d, 1d), new LatLng(2d, 2d), new LatLng(3d, 3d), new LatLng(1d, 1d)]))
        ]
        sameJson(response.data, [
                [
                        sceneAreaId: 'scene area id',
                        polygon    : [[1d, 1d], [2d, 2d], [3d, 3d], [1d, 1d]]
                ]
        ])
        response.status == 200
    }

    def 'GET /data/sceneareas/{sceneAreaId} returns scenes'() {
        def query = [fromDate: '2016-01-01', toDate: '2016-02-01', targetDayOfYear: 365]
        def expectedSceneQuery = new SceneQuery(
                sceneAreaId: 'someSceneAreaId',
                fromDate: parseDateString(query.fromDate),
                toDate: parseDateString(query.toDate),
                targetDayOfYear: query.targetDayOfYear
        )
        def expectedScene = scene(expectedSceneQuery.fromDate)

        when:
        def response = get(path: 'data/sceneareas/someSceneAreaId', query: query)

        then:
        1 * queryDispatcher.submit({ it.sceneQuery == expectedSceneQuery } as FindScenesForSceneArea) >> [expectedScene]
        sameJson(response.data, [
                [
                        sceneId          : expectedScene.id,
                        sensor           : expectedScene.sensorId,
                        browseUrl        : expectedScene.browseUrl as String,
                        acquisitionDate  : DateTime.toDateString(expectedScene.acquisitionDate),
                        cloudCover       : expectedScene.cloudCover,
                        sunAzimuth       : expectedScene.sunAzimuth,
                        sunElevation     : expectedScene.sunElevation,
                        daysFromTargetDay: 1
                ]
        ])
        response.status == 200
    }

    def 'GET /data/best-scenes returns scenes'() {
        def expectedQuery = new FindBestScenes(
                sceneAreaIds: ['some-area', 'another-area'],
                sensorIds: ['some-sensor', 'another-sensor'],
                fromDate: parseDateString('2015-01-01'),
                toDate: parseDateString('2016-01-01'),
                targetDayOfYear: 22,
                targetDayOfYearWeight: 0.12,
                cloudCoverTarget: 0.001
        )
        def expectedScene = scene(parseDateString('2015-01-01'))

        when:
        def response = get(path: 'data/best-scenes', query: [
                sceneAreaIds         : 'some-area, another-area',
                sensorIds            : 'some-sensor, another-sensor',
                fromDate             : toDateTimeString(expectedQuery.fromDate),
                toDate               : toDateTimeString(expectedQuery.toDate),
                targetDayOfYear      : expectedQuery.targetDayOfYear,
                targetDayOfYearWeight: expectedQuery.targetDayOfYearWeight,
                cloudCoverTarget     : expectedQuery.cloudCoverTarget
        ])

        then:
        1 * queryDispatcher.submit(expectedQuery) >> [
                'some-area': [expectedScene]
        ]
        sameJson(response.data, [
                'some-area': [[
                                      sceneId          : expectedScene.id,
                                      sensor           : expectedScene.sensorId,
                                      browseUrl        : expectedScene.browseUrl as String,
                                      acquisitionDate  : DateTime.toDateString(expectedScene.acquisitionDate),
                                      cloudCover       : expectedScene.cloudCover,
                                      sunAzimuth       : expectedScene.sunAzimuth,
                                      sunElevation     : expectedScene.sunElevation,
                                      daysFromTargetDay: 21
                              ]]
        ])
        response.status == 200
    }

    private SceneMetaData scene(Date acquisitionDate) {
        new SceneMetaData(
                id: 'scene id',
                source: USGS,
                sceneAreaId: 'scene area id',
                sensorId: 'sensor id',
                acquisitionDate: acquisitionDate,
                cloudCover: 1.2,
                sunAzimuth: 3.4,
                sunElevation: 5.6,
                browseUrl: URI.create('http://browse.url'),
                updateTime: new Date() - 12
        )
    }
}

