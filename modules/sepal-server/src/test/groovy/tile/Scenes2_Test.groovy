package tile

import org.openforis.sepal.component.datasearch.api.SceneMetaData
import org.openforis.sepal.component.datasearch.internal.Scenes2
import spock.lang.Ignore
import spock.lang.Specification

@Ignore
class Scenes2_Test extends Specification {
    static final SQUARE = [[0d, 0d], [1d, 0d], [1d, 1d], [0d, 1d], [0d, 0d]] as double[][]
    static final ROTATED = [[0d, 0.5d], [0.5d, 0d], [1d, 0.5d], [0.5d, 1d], [0d, 0.5d]] as double[][]
    int sceneIndex

    def 'Test'() {
        when:
        select(scenes(0.11, scene(ROTATED)))

        then:
        false
    }

    private List<SceneMetaData> select(Scenes2 scenes) {
        scenes.selectScenes(0.9, 1, Integer.MAX_VALUE, null)
    }

    private Scenes2 scenes(double gridCellWidth, SceneMetaData... scenes) {
        new Scenes2(gridCellWidth, scenes as List)
    }

    private SceneMetaData scene(double[][] footprint) {
        new SceneMetaData(
                id: "scene-${++sceneIndex}",
                cloudCover: 50,
                footprint: footprint
        )
    }
}
