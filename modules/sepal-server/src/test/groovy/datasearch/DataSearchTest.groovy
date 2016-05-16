package datasearch

import fake.Database
import org.openforis.sepal.component.datasearch.*
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaData
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoi
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneArea
import org.openforis.sepal.component.datasearch.usgs.UsgsGateway
import spock.lang.Specification

import static org.openforis.sepal.component.datasearch.MetaDataSource.USGS

class DataSearchTest extends Specification {
    public static final String SOME_AOI_ID = 'some AOI'
    public static final String SCENE_AREA_ID = 'some scene area'
    def database = new Database()
    def sceneAreaProvider = new FakeSceneAreaProvider()
    def usgs = new FakeUsgsGateway()
    def component = new DataSearchComponent(
            database.dataSource,
            sceneAreaProvider,
            usgs,
            new DataSearchComponent.Config(1, File.createTempDir().absolutePath)
    )

    def 'When finding scene areas for AOI, scene areas are returned'() {
        def expectedSceneAreas = sceneAreaProvider.areas(SOME_AOI_ID, [sceneArea('some scene area')])

        when:
        def sceneAreas = component.submit(new FindSceneAreasForAoi(aoiId: SOME_AOI_ID))

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
        def scene1 = sceneFromArea('first')
        def scene2 = sceneFromArea('second')
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
            String sceneAreaId = SCENE_AREA_ID
    ) {
        def query = new SceneQuery(sceneAreaId: sceneAreaId, fromDate: from, toDate: to)
        return component.submit(new FindScenesForSceneArea(query))
    }

    SceneArea sceneArea(String id = SCENE_AREA_ID) {
        new SceneArea(id: id, polygon: new Polygon([new LatLng(0, 0), new LatLng(1, 1), new LatLng(2, 2), new LatLng(0, 0)]))
    }

    SceneMetaData scene() {
        scene(new Date(), new Date(), SCENE_AREA_ID)
    }

    SceneMetaData scene(Date acquisitionDate, updateTime, sceneAreaId) {
        return new SceneMetaData(
                id: UUID.randomUUID() as String,
                source: USGS,
                sceneAreaId: sceneAreaId,
                sensorId: 'LANDSAT_8',
                acquisitionDate: acquisitionDate,
                cloudCover: 0,
                sunAzimuth: 123.4,
                sunElevation: 12.4,
                browseUrl: URI.create('http://some.browse/url'),
                updateTime: updateTime)
    }

    SceneMetaData sceneFromArea(String sceneAreaId) {
        scene(new Date(), new Date(), sceneAreaId)
    }

    SceneMetaData sceneUpdatedAt(String date) {
        sceneUpdatedAt(Date.parse('yyyy-MM-dd', date))
    }

    SceneMetaData sceneUpdatedAt(Date date) {
        scene(date, date, SCENE_AREA_ID)
    }

    SceneMetaData sceneAcquiredAt(String date) {
        def acquisitionDate = Date.parse('yyyy-MM-dd', date)
        scene(acquisitionDate, acquisitionDate, SCENE_AREA_ID)
    }
}

class FakeUsgsGateway implements UsgsGateway {
    final List<SceneMetaData> scenes = []
    private Map<String, Date> lastUpdateBySensor

    void eachSceneUpdatedSince(Map<String, Date> lastUpdateBySensor, Closure callback) throws UsgsGateway.SceneMetaDataRetrievalFailed {
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