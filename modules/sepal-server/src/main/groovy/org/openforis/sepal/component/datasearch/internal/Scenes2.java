package org.openforis.sepal.component.datasearch.internal;

import com.vividsolutions.jts.geom.Coordinate;
import com.vividsolutions.jts.geom.GeometryFactory;
import com.vividsolutions.jts.geom.Point;
import com.vividsolutions.jts.geom.Polygon;
import com.vividsolutions.jts.geom.impl.PackedCoordinateSequenceFactory;
import org.openforis.sepal.component.datasearch.api.SceneMetaData;

import java.util.*;

import static java.util.Arrays.stream;
import static java.util.Comparator.comparingDouble;

public class Scenes2 {
    private final double gridCellWidth;
    private final double halfWidth;
    private final GeometryFactory geometryFactory = new GeometryFactory(PackedCoordinateSequenceFactory.FLOAT_FACTORY);
    private final Map<String, Map<SceneMetaData, Set<Cell>>> cellsBySceneBySceneArea = new HashMap<>();
    private final Set<Cell> uncoveredCells;
    private final Set<Cell> coveredCells = new HashSet<>();

    public Scenes2(double gridCellWidth, List<SceneMetaData> scenes) {
        this.gridCellWidth = gridCellWidth;
        halfWidth = gridCellWidth / 2;
        Map<Point, Cell> cellByCentroid = new HashMap<>();
        scenes.forEach(scene -> addScene(scene, cellByCentroid));
        uncoveredCells = new HashSet<>(cellByCentroid.values());
    }

    private void addScene(SceneMetaData scene, Map<Point, Cell> cellByCentroid) {
        Set<Cell> cells = new HashSet<>();
        String sceneArea = scene.getSceneAreaId();
        Map<SceneMetaData, Set<Cell>> cellsByScene = cellsBySceneBySceneArea.computeIfAbsent(sceneArea, k -> new HashMap<>());
        cellsByScene.put(scene, cells);
        double[][] footprint = scene.getFootprint();
        Coordinate[] coordinates = stream(footprint).map(coord -> new Coordinate(coord[0], coord[1])).toArray(Coordinate[]::new);
        Polygon scenePolygon = geometryFactory.createPolygon(coordinates);
        double minX = stream(footprint).min(comparingDouble(coord -> coord[0])).get()[0];
        double maxX = stream(footprint).max(comparingDouble(coord -> coord[0])).get()[0];
        double minY = stream(footprint).min(comparingDouble(coord -> coord[1])).get()[1];
        double maxY = stream(footprint).max(comparingDouble(coord -> coord[1])).get()[1];

        double fromX = gridCellWidth * Math.floor(minX / gridCellWidth) + halfWidth;
        double fromY = gridCellWidth * Math.floor(minY / gridCellWidth) + halfWidth;
        for (double x = fromX; x < maxX; x += gridCellWidth) {
            for (double y = fromY; y < maxY; y += gridCellWidth) {
                Point centroid = geometryFactory.createPoint(new Coordinate(x, y));
                if (scenePolygon.contains(centroid)) {
                    Cell cell = cellByCentroid.computeIfAbsent(centroid, p -> new Cell(p));
                    cells.add(cell);
                }
            }
        }
    }

    public Map<String, List<SceneMetaData>> selectScenes(
            double cloudCoverTarget,
            int minScenes,
            int maxScenes) {
        Map<String, List<SceneMetaData>> selectedScenesBySceneArea = new HashMap<>();
        Set<String> sceneAreas = new HashSet<>(cellsBySceneBySceneArea.keySet());
        for (String sceneArea : sceneAreas)
            selectedScenesBySceneArea.put(sceneArea, new ArrayList<>());

        boolean improved = true;
        while (improved && !uncoveredCells.isEmpty() && !cellsBySceneBySceneArea.isEmpty()) {
            improved = false;
            Iterator<String> sceneAreaIterator = sceneAreas.iterator();
            while (sceneAreaIterator.hasNext()) {
                String sceneArea = sceneAreaIterator.next();
                boolean sceneAreaImproved = selectScene(cloudCoverTarget, sceneArea, selectedScenesBySceneArea.get(sceneArea));
                if (sceneAreaImproved) { // TODO: Handle min/max scenes. Add max weighted coverage, target day to handle min
                    improved = true;
                } else {
                    sceneAreaIterator.remove();
                }
            }
        }
        return selectedScenesBySceneArea;
    }

    private boolean selectScene(double maxCloudCover, String sceneArea, List<SceneMetaData> selectedScenes) {
        Map<SceneMetaData, Set<Cell>> cellsByScene = cellsBySceneBySceneArea.get(sceneArea);
        if (cellsByScene == null)
            return false;
        Map.Entry<SceneMetaData, Set<Cell>> bestSceneCells = cellsByScene.entrySet().stream().max(comparingDouble(entry -> {
            SceneMetaData scene = entry.getKey();
            Set<Cell> cells = entry.getValue();
            cells.removeAll(coveredCells);
            return improvement(scene, cells);
        })).get();


        SceneMetaData selectedScene = bestSceneCells.getKey();
        Set<Cell> sceneCells = bestSceneCells.getValue();
        if (!(improvement(selectedScene, sceneCells) > 0))
            return false;
        for (Cell sceneCell : sceneCells) {
            double cloudCover = sceneCell.add(selectedScene);
            if (cloudCover < maxCloudCover) {
                uncoveredCells.remove(sceneCell);
                this.coveredCells.add(sceneCell);
            }
        }
        selectedScenes.add(selectedScene);
        cellsByScene.remove(selectedScene);
        if (cellsByScene.isEmpty())
            cellsBySceneBySceneArea.remove(sceneArea);
        return true;
    }

    private double improvement(SceneMetaData selectedScene, Set<Cell> coveredCells) {
        return (100 - selectedScene.getCloudCover()) * coveredCells.size();
    }

    private static class Cell {
        final Point p;
        double cloudCover = 1;

        public Cell(Point p) {
            this.p = p;
        }

        double add(SceneMetaData scene) {
            return cloudCover *= scene.getCloudCover() / 100;
        }
    }
}
