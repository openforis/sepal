package component.datasearch

import fake.Database
import org.openforis.sepal.component.datasearch.*
import org.openforis.sepal.component.datasearch.api.DataSetMetadataGateway
import org.openforis.sepal.component.datasearch.api.FusionTableShape
import org.openforis.sepal.component.datasearch.api.LatLng
import org.openforis.sepal.component.datasearch.api.Polygon
import org.openforis.sepal.component.datasearch.api.SceneArea
import org.openforis.sepal.component.datasearch.api.SceneMetaData
import org.openforis.sepal.component.datasearch.api.SceneQuery
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaData
import org.openforis.sepal.component.datasearch.query.FindBestScenes
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoi
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneArea
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.transaction.SqlConnectionManager
import spock.lang.Specification

import static org.openforis.sepal.component.datasearch.api.DataSet.LANDSAT
import static org.openforis.sepal.util.DateTime.parseDateString

class DataSearchTest extends Specification {
    static final String SOME_FUSION_TABLE = 'some fusion table'
    static final String SOME_KEY_COLUMN = 'some fusion table column'
    static final String SOME_KEY_VALUE = 'some key value'
    static final String SCENE_AREA_ID = 'some scene area'
    final database = new Database()
    final connectionManager = new SqlConnectionManager(database.dataSource)
    final sceneAreaProvider = new FakeGoogleEarthEngineGateway()
    final usgs = new FakeGateway()
    final sentinel2 = new FakeGateway()
    final component = new DataSearchComponent(
            connectionManager,
            sceneAreaProvider,
            usgs,
            sentinel2,
            'some-google-maps-api-key',
            new SynchronousEventDispatcher()
    )

    def 'When finding scene areas for AOI, scene areas are returned'() {
        def expectedSceneAreas = sceneAreaProvider.areas(SOME_FUSION_TABLE, SOME_KEY_COLUMN, SOME_KEY_VALUE, [sceneArea('some scene area')])

        when:
        def sceneAreas = component.submit(new FindSceneAreasForAoi(
                LANDSAT,
                new FusionTableShape(
                        tableName: SOME_FUSION_TABLE,
                        keyColumn: SOME_KEY_COLUMN,
                        keyValue: SOME_KEY_VALUE
                )))

        then:
        sceneAreas == expectedSceneAreas
    }

    def 'Given no scenes exist, when finding scenes, no scenes are returned'() {
        expect:
        findScenes().empty
    }

    def 'Given new scenes, when updating USGS scenes, new scenes are available'() {
        usgs.appendScenes([scene()])

        when:
        updateUsgsSceneMetaData()

        then:
        def scenes = findScenes()
        scenes == usgs.scenes
    }

    def 'Given old and new scenes, when updating USGS scenes, new scenes are available'() {
        usgs.appendScenes([scene()])
        updateUsgsSceneMetaData()

        when:
        updateUsgsSceneMetaData()

        then:

        findScenes() == usgs.scenes
    }

    def 'Given old and new scenes, when updating USGS scenes, only scenes after last update are requested'() {
        def date = new Date() - 10
        def scene = sceneUpdatedAt(date)
        usgs.appendScenes([scene])
        updateUsgsSceneMetaData()

        when:
        updateUsgsSceneMetaData()

        then:
        usgs.lastUpdateBySensor() == [(scene.sensorId): date]
    }

    def 'When finding scenes from one scene area, scenes from other scene areas are excluded'() {
        def scene1 = scene('first')
        def scene2 = scene('second')
        usgs.appendScenes([scene1, scene2])
        updateUsgsSceneMetaData()

        expect:
        findScenesInArea('first') == [scene1]
        findScenesInArea('second') == [scene2]
    }

    def 'When finding scenes in date range, scenes outside of range are excluded'() {
        def scene1 = sceneUpdatedAt('2015-01-01')
        def scene2 = sceneUpdatedAt('2015-01-02')
        def scene3 = sceneUpdatedAt('2015-01-03')
        def scene4 = sceneUpdatedAt('2015-01-04')
        def scene5 = sceneUpdatedAt('2015-01-05')
        usgs.appendScenes([scene1, scene2, scene3, scene4, scene5])
        updateUsgsSceneMetaData()

        expect:
        findScenesInDateRange('2015-01-02', '2015-01-04') == [scene2, scene3, scene4]
    }

    def 'When finding best scenes, scenes are returned'() {
        def scene = scene(parseDateString('2016-01-01'))
        usgs.appendScenes([scene])
        updateUsgsSceneMetaData()

        when:
        def sceneAreasBySceneAreas = component.submit(new FindBestScenes(
                dataSet: LANDSAT,
                sceneAreaIds: [SCENE_AREA_ID],
                sensorIds: [scene.sensorId],
                fromDate: new Date(0),
                toDate: new Date(),
                targetDayOfYear: 1,
                targetDayOfYearWeight: 0.5,
                cloudCoverTarget: 0.001
        ))

        then:
        sceneAreasBySceneAreas.size() == 1
        sceneAreasBySceneAreas[SCENE_AREA_ID] == [scene]
    }

    def 'Given min-scenes is 2 and first scene is cloud-free, when finding best scenes, two scenes are returned'() {
        def cloudFreeScene = sceneWithCloudCover(0)
        def anotherScene = scene()
        usgs.appendScenes([cloudFreeScene, anotherScene])
        updateUsgsSceneMetaData()

        when:
        def scenesBySceneAreas = component.submit(new FindBestScenes(
                dataSet: LANDSAT,
                sceneAreaIds: [SCENE_AREA_ID],
                sensorIds: [cloudFreeScene.sensorId],
                fromDate: new Date(0),
                toDate: new Date(),
                targetDayOfYear: 1,
                targetDayOfYearWeight: 0.5,
                cloudCoverTarget: 0.001,
                minScenes: 2
        ))

        then:
        scenesBySceneAreas.size() == 1
        def scenes = scenesBySceneAreas[SCENE_AREA_ID]
        scenes == [cloudFreeScene, anotherScene]
    }

    def 'Given max-scenes is 1 and first scene is cloud very cloudy, when finding best scenes, one scene is returned'() {
        def cloudyScene = sceneWithCloudCover(0.8)
        def anotherScene = sceneWithCloudCover(0.9)
        usgs.appendScenes([cloudyScene, anotherScene])
        updateUsgsSceneMetaData()

        when:
        def scenesBySceneAreas = component.submit(new FindBestScenes(
                dataSet: LANDSAT,
                sceneAreaIds: [SCENE_AREA_ID],
                sensorIds: [cloudyScene.sensorId],
                fromDate: new Date(0),
                toDate: new Date(),
                targetDayOfYear: 1,
                targetDayOfYearWeight: 0.5,
                cloudCoverTarget: 0.001,
                maxScenes: 1
        ))

        then:
        scenesBySceneAreas.size() == 1
        def scenes = scenesBySceneAreas[SCENE_AREA_ID]
        scenes == [cloudyScene]
    }

    void updateUsgsSceneMetaData() {
        component.submit(new UpdateUsgsSceneMetaData())
    }

    List<SceneMetaData> findScenesInArea(String sceneAreaId) {
        findScenes(new Date(Long.MIN_VALUE), new Date(Long.MAX_VALUE), sceneAreaId)
    }

    List<SceneMetaData> findScenesInDateRange(String from, String to) {
        findScenes(Date.parse('yyyy-MM-dd', from), Date.parse('yyyy-MM-dd', to), SCENE_AREA_ID)
    }

    List<SceneMetaData> findScenes(
            Date from = new Date(Long.MIN_VALUE),
            Date to = new Date(Long.MAX_VALUE),
            String sceneAreaId = SCENE_AREA_ID) {
        def query = new SceneQuery(sceneAreaId: sceneAreaId, fromDate: from, toDate: to)
        return component.submit(new FindScenesForSceneArea(query))
    }

    SceneArea sceneArea(String id = SCENE_AREA_ID) {
        new SceneArea(id: id, polygon: new Polygon([new LatLng(0, 0), new LatLng(1, 1), new LatLng(2, 2), new LatLng(0, 0)]))
    }

    SceneMetaData scene(Date acquisitionDate = parseDateString('2016-01-01')) {
        scene(acquisitionDate, new Date(), 0.1, SCENE_AREA_ID)
    }

    SceneMetaData sceneWithCloudCover(double cloudCover) {
        scene(parseDateString('2016-01-01'), new Date(), cloudCover, SCENE_AREA_ID)
    }

    SceneMetaData scene(
            Date acquisitionDate = parseDateString('2016-01-01'),
            updateTime = parseDateString('2016-01-01'),
            double cloudCover = 0.1,
            sceneAreaId) {
        return new SceneMetaData(
                id: UUID.randomUUID() as String,
                dataSet: LANDSAT,
                sceneAreaId: sceneAreaId,
                sensorId: 'LANDSAT_8',
                acquisitionDate: acquisitionDate,
                cloudCover: cloudCover,
                sunAzimuth: 123.4,
                sunElevation: 12.4,
                browseUrl: URI.create('http://some.browse/url'),
                updateTime: updateTime)
    }

    SceneMetaData sceneUpdatedAt(String date) {
        sceneUpdatedAt(Date.parse('yyyy-MM-dd', date))
    }

    SceneMetaData sceneUpdatedAt(Date date) {
        scene(date, date, SCENE_AREA_ID)
    }
}

class FakeGateway implements DataSetMetadataGateway {
    final List<SceneMetaData> scenes = []
    private Map<String, Date> lastUpdateBySensor

    void eachSceneUpdatedSince(Map<String, Date> lastUpdateBySensor, Closure callback) throws DataSetMetadataGateway.SceneMetaDataRetrievalFailed {
        this.lastUpdateBySensor = lastUpdateBySensor
        def scenes = scenes.findAll { it.acquisitionDate > lastUpdateBySensor[it.sensorId] }
        callback.call(scenes)
    }

    void appendScenes(List<SceneMetaData> scenes) {
        this.scenes.addAll(scenes)
    }

    Map<String, Date> lastUpdateBySensor() {
        lastUpdateBySensor
    }
}