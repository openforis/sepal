package org.openforis.sepal.component.datasearch.internal;

import com.vividsolutions.jts.geom.Coordinate;
import com.vividsolutions.jts.geom.GeometryFactory;
import com.vividsolutions.jts.geom.Point;
import com.vividsolutions.jts.geom.Polygon;
import org.openforis.sepal.component.datasearch.api.SceneMetaData;

import java.util.*;

import static java.util.Arrays.stream;
import static java.util.Comparator.comparingDouble;

public class Scenes2 {
    private final double gridCellWidth;
    private final double halfWidth;
    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final Map<SceneMetaData, Cell> cellByScene = new HashMap<>();


    public Scenes2(double gridCellWidth, List<SceneMetaData> scenes) {
        this.gridCellWidth = gridCellWidth;
        halfWidth = gridCellWidth / 2;
        Map<Point, Cell> cellByCentroid = new HashMap<>();
        scenes.forEach(scene -> addScene(scene, cellByCentroid));
    }

    private void addScene(SceneMetaData scene, Map<Point, Cell> cellByCentroid) {
        double[][] footprint = scene.getFootprint();
        Coordinate[] coordinates = stream(footprint).map(coord -> new Coordinate(coord[0], coord[1])).toArray(Coordinate[]::new);
        Polygon scenePolygon = geometryFactory.createPolygon(coordinates);
        double minX = stream(footprint).min(comparingDouble(coord -> coord[0])).get()[0];
        double maxX = stream(footprint).max(comparingDouble(coord -> coord[0])).get()[0];
        double minY = stream(footprint).min(comparingDouble(coord -> coord[1])).get()[1];
        double maxY = stream(footprint).max(comparingDouble(coord -> coord[1])).get()[1];

        double fromX = gridCellWidth * Math.floor(minX / gridCellWidth);
        double fromY = gridCellWidth * Math.floor(minY / gridCellWidth);
        for (double x = fromX; x < maxX; x += gridCellWidth) {
            double centerX = x + halfWidth;
            for (double y = fromY; y < maxY; y += gridCellWidth) {
                double centerY = y + halfWidth;
                Point centroid = geometryFactory.createPoint(new Coordinate(centerX, centerY));
                if (scenePolygon.contains(centroid)) {
                    Cell cell = cellByCentroid.computeIfAbsent(centroid, p -> new Cell());
                    cell.associateWith(scene);
                    cellByScene.put(scene, cell);
                }
            }
        }
    }

    public List<SceneMetaData> selectScenes(
            double minCoverage,
            int minScenes,
            int maxScenes,
            ScoringAlgorithm scoringAlgorithm) {
        // Scene with max (1 - cloud cover) * cells.size()
        // Add scene
        // Remove cells that reached threshold
        return null;
    }

    private static class Cell {
        Set<SceneMetaData> scenes = new HashSet<>();

        void associateWith(SceneMetaData scene) {
            scenes.add(scene);
        }
    }

    public interface ScoringAlgorithm {
        double score(SceneMetaData scene, double improvement);
    }
}
