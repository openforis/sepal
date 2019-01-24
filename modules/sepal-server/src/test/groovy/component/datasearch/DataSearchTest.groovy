package component.datasearch

import fake.Database
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.datasearch.DataSearchComponent
import org.openforis.sepal.component.datasearch.api.*
import org.openforis.sepal.component.datasearch.command.UpdateSceneMetaData
import org.openforis.sepal.component.datasearch.query.FindBestScenes
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoi
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneArea
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.user.User
import spock.lang.Specification

import java.text.SimpleDateFormat

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
    final sepalUser = new User(
        username: 'test-user',
        googleTokens: new GoogleTokens('refresh', 'access', 123)
    )
    final component = new DataSearchComponent(
        Mock(Component),
        Mock(Component),
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
            sepalUser,
            'LANDSAT',
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
        updateSceneMetaData()

        then:
        def scenes = findScenes()
        scenes == usgs.scenes
    }

    def 'Given old and new scenes, when updating USGS scenes, new scenes are available'() {
        usgs.appendScenes([scene()])
        updateSceneMetaData()

        when:
        updateSceneMetaData()

        then:

        findScenes() == usgs.scenes
    }

    def 'Given old and new scenes, when updating USGS scenes, only scenes after last update are requested'() {
        def date = new Date() - 10
        def scene = sceneUpdatedAt(date)
        usgs.appendScenes([scene])
        updateSceneMetaData()

        when:
        updateSceneMetaData()

        then:
        usgs.lastUpdateBySensor() == [(scene.dataSet): date]
    }

    def 'When finding scenes from one scene area, scenes from other scene areas are excluded'() {
        def scene1 = scene(sceneAreaId: 'first')
        def scene2 = scene(sceneAreaId: 'second')
        usgs.appendScenes([scene1, scene2])
        updateSceneMetaData()

        expect:
        findScenes(sceneAreaId: 'first') == [scene1]
        findScenes(sceneAreaId: 'second') == [scene2]
    }

    def 'When finding scenes in date range, scenes outside of range are excluded'() {
        def scene1 = sceneUpdatedAt('2015-01-01')
        def scene2 = sceneUpdatedAt('2015-01-02')
        def scene3 = sceneUpdatedAt('2015-01-03')
        def scene4 = sceneUpdatedAt('2015-01-04')
        def scene5 = sceneUpdatedAt('2015-01-05')
        usgs.appendScenes([scene1, scene2, scene3, scene4, scene5])
        updateSceneMetaData()

        expect:
        findScenes(from: '2015-01-02', to: '2015-01-04').toSet() == [scene2, scene3].toSet()
    }


    def 'Sorts by cloud cover'() {
        def scene1 = scene(cloudCover: 1)
        def scene2 = scene(cloudCover: 0)
        usgs.appendScenes([scene1, scene2])
        updateSceneMetaData()

        expect:
        findScenes(targetDayOfYearWeight: 0) == [scene2, scene1]
    }

    def 'Sorts by target day'() {
        def scene1 = scene(dayOfYear: 1)
        def scene2 = scene(dayOfYear: 10)
        usgs.appendScenes([scene1, scene2])
        updateSceneMetaData()

        expect:
        findScenes(targetDayOfYear: 9, targetDayOfYearWeight: 1) == [scene2, scene1]
    }

    def 'Sorts weighted target day and cloud cover'() {
        def scene1 = scene(id: '1', dayOfYear: 9, cloudCover: 0)
        def scene2 = scene(id: '2', dayOfYear: 9, cloudCover: 100)
        def scene3 = scene(id: '3', dayOfYear: 20, cloudCover: 2)
        def scene4 = scene(id: '4', dayOfYear: 120, cloudCover: 80)
        usgs.appendScenes([scene1, scene2, scene3, scene4])
        updateSceneMetaData()

        expect:
        findScenes(targetDayOfYear: 9, targetDayOfYearWeight: 0.5) == [scene1, scene3, scene2, scene4]
    }


    def 'When finding best scenes, scenes are returned'() {
        def scene = scene(acquisitionDate: parseDateString('2016-01-01'))
        usgs.appendScenes([scene])
        updateSceneMetaData()

        when:
        def sceneAreasBySceneAreas = component.submit(new FindBestScenes(
            source: 'LANDSAT',
            sceneAreaIds: [SCENE_AREA_ID],
            dataSets: [scene.dataSet],
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
        updateSceneMetaData()

        when:
        def scenesBySceneAreas = component.submit(new FindBestScenes(
            source: 'LANDSAT',
            sceneAreaIds: [SCENE_AREA_ID],
            dataSets: [cloudFreeScene.dataSet],
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
        updateSceneMetaData()

        when:
        def scenesBySceneAreas = component.submit(new FindBestScenes(
            source: 'LANDSAT',
            sceneAreaIds: [SCENE_AREA_ID],
            dataSets: [cloudyScene.dataSet],
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

    void updateSceneMetaData() {
        component.submit(new UpdateSceneMetaData())
    }

    List<SceneMetaData> findScenes(Map args = [:]) {
        def query = new SceneQuery(
            sceneAreaId: args.sceneAreaId ?: SCENE_AREA_ID,
            fromDate: args.from ? parseDateString(args.from) : new Date(0),
            toDate: args.to ? parseDateString(args.to) : new Date(Long.MAX_VALUE),
            source: 'LANDSAT',
            dataSets: ['LANDSAT_8'],
            targetDayOfYear: args.targetDayOfYear ?: 1,
            targetDayOfYearWeight: args.targetDayOfYearWeight ?: 0.5,
        )
        return component.submit(new FindScenesForSceneArea(query))
    }

    SceneArea sceneArea(String id = SCENE_AREA_ID) {
        new SceneArea(id: id, polygon: new Polygon([new LatLng(0, 0), new LatLng(1, 1), new LatLng(2, 2), new LatLng(0, 0)]))
    }

    SceneMetaData sceneWithCloudCover(double cloudCover) {
        scene(cloudCover: cloudCover)
    }

    SceneMetaData scene(Map args = [:]) {
        def acquisitionDate = args.acquisitionDate ?:
            args.dayOfYear
                ? parseDateString('2016-01-01') + (args.dayOfYear - 1)
                : parseDateString('2016-01-01')
        return new SceneMetaData(
            id: args.id ?: UUID.randomUUID() as String,
            source: 'LANDSAT',
            sceneAreaId: args.sceneAreaId ?: SCENE_AREA_ID,
            dataSet: 'LANDSAT_8',
            acquisitionDate: acquisitionDate,
            cloudCover: args.cloudCover ?: 0.1,
            sunAzimuth: 123.4,
            sunElevation: 12.4,
            browseUrl: URI.create('http://some.browse/url'),
            updateTime: args.updateTime ?: parseDateString('2016-01-01')
        )
    }

    SceneMetaData sceneUpdatedAt(String date) {
        sceneUpdatedAt(new SimpleDateFormat('yyyy-MM-dd').parse(date))
    }

    SceneMetaData sceneUpdatedAt(Date date) {
        scene(acquisitionDate: date, updateTime: date)
    }
}

class FakeGateway implements DataSetMetadataGateway {
    final List<SceneMetaData> scenes = []
    private Map<String, Date> lastUpdateBySensor

    void eachSceneUpdatedSince(Map<String, Date> lastUpdateBySensor, Closure callback) throws SceneMetaDataRetrievalFailed {
        this.lastUpdateBySensor = lastUpdateBySensor
        def scenes = scenes.findAll { it.acquisitionDate > lastUpdateBySensor[it.dataSet] }
        callback.call(scenes)
    }

    void appendScenes(List<SceneMetaData> scenes) {
        this.scenes.addAll(scenes)
    }

    Map<String, Date> lastUpdateBySensor() {
        lastUpdateBySensor
    }
}