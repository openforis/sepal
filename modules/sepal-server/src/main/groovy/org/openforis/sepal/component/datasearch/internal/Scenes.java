package org.openforis.sepal.component.datasearch.internal;

import com.vividsolutions.jts.geom.Coordinate;
import com.vividsolutions.jts.geom.Geometry;
import com.vividsolutions.jts.geom.GeometryFactory;
import com.vividsolutions.jts.geom.Polygon;
import org.openforis.sepal.component.datasearch.api.SceneMetaData;

import java.util.*;
import java.util.function.Function;

import static java.util.Comparator.comparingDouble;
import static java.util.stream.Collectors.toMap;
import static java.util.stream.Collectors.toSet;

public class Scenes {
    private static final double CELL_WIDTH = 0.1;
    private static final double GRID_GAP = 0.00000001;

    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final List<SceneMetaData> scenes;
    private final Collection<Cell> cells;

    public Scenes(List<SceneMetaData> scenes) {
        this.scenes = scenes;
        Geometry aoi = createAoi();
        if (aoi.isEmpty())
            cells = Collections.emptyList();
        else
            cells = createCells(aoi);
    }

    public List<SceneMetaData> selectScenes(
            double minCoverage,
            int minScenes,
            int maxScenes,
            ScoringAlgorithm scoringAlgorithm) {

        double cellAreaFactor = 1d / cells.size();
        Map<Cell, Double> coverageByCell = cells.stream().collect(toMap(
                Function.identity(),
                cell -> 0d
        ));
        Map<SceneMetaData, Collection<Cell>> cellsByScene = cellsByScene(scenes);

        List<SceneMetaData> selected = new ArrayList<>();
        Set<SceneMetaData> leftToCheck = new LinkedHashSet<>(scenes); // Keeps initial order, but have efficient removes

        double totalCoverage = 0;
        while (!leftToCheck.isEmpty() && selected.size() < maxScenes
                && (selected.size() < minScenes || totalCoverage < minCoverage)) {
            Map<SceneMetaData, Double> scoreByScene = leftToCheck.stream().collect(toMap(
                    Function.identity(),
                    scene -> {
                        Set<Cell> cellsWithoutCoverage = new HashSet<>();
                        Collection<Cell> cells = cellsByScene.get(scene);
                        double totalImprovement = cells.stream().mapToDouble((cell) -> {
                            double cellCoverage = coverageByCell.get(cell);
                            double improvement = (1 - cellCoverage) * (1 - scene.getCloudCover() / 100);
                            if (improvement <= 0)
                                cellsWithoutCoverage.add(cell);
                            return improvement;
                        }).sum() * cellAreaFactor;
                        // No need to keep on checking cells that a scene provide no improvement for
                        cells.removeAll(cellsWithoutCoverage);
                        return scoringAlgorithm.score(scene, totalImprovement);
                    }));
            SceneMetaData scene = scoreByScene.entrySet().stream().max(comparingDouble(Map.Entry::getValue)).get().getKey();
            selected.add(scene);
            leftToCheck.remove(scene);

            cellsByScene.get(scene).forEach(cell -> {
                Double cellCoverage = coverageByCell.get(cell);
                double improvement = (1 - cellCoverage) * (1 - scene.getCloudCover() / 100);
                coverageByCell.put(cell, cellCoverage + improvement);
            });
            totalCoverage = coverageByCell.values().stream().mapToDouble(Double::doubleValue).sum() * cellAreaFactor;
        }
        return selected;
    }

    private Map<SceneMetaData, Collection<Cell>> cellsByScene(List<SceneMetaData> scenes) {
        return scenes.stream().collect(toMap(
                Function.identity(),
                scene -> intersection(cells, scene.getFootprint())
        ));
    }

    @SuppressWarnings("ConstantConditions")
    private Collection<Cell> createCells(Geometry aoi) {
        Coordinate[] boundryCoordinates = aoi.getBoundary().getCoordinates();
        double minX = Arrays.stream(boundryCoordinates).min(comparingDouble(value -> value.x)).get().x;
        double maxX = Arrays.stream(boundryCoordinates).max(comparingDouble(value -> value.x)).get().x;
        double minY = Arrays.stream(boundryCoordinates).min(comparingDouble(value -> value.y)).get().y;
        double maxY = Arrays.stream(boundryCoordinates).max(comparingDouble(value -> value.y)).get().y;

        List<Cell> grid = new ArrayList<>();
        for (double x = minX; x < maxX; x += CELL_WIDTH + GRID_GAP) {
            for (double y = minY; y < maxY; y += CELL_WIDTH + GRID_GAP) {
                Cell cell = new Cell(geometryFactory.createPolygon(new Coordinate[]{
                        new Coordinate(x, y),
                        new Coordinate(x + CELL_WIDTH, y),
                        new Coordinate(x + CELL_WIDTH, y + CELL_WIDTH),
                        new Coordinate(x, y + CELL_WIDTH),
                        new Coordinate(x, y)
                }));
                grid.add(cell);
            }
        }
        return intersection(grid, aoi);
    }

    private Geometry createAoi() {
        Geometry aoi = geometryFactory.createGeometryCollection(null);
        for (SceneMetaData scene : scenes)
            aoi = aoi.union(toGeometry(scene.getFootprint()));
        return aoi;
    }

    private Set<Cell> intersection(Collection<Cell> grid, double[][] footprint) {
        Geometry geometry = toGeometry(footprint);
        return grid.stream().filter((cell) -> cell.polygon.intersects(geometry)).collect(toSet());
    }


    private Set<Cell> intersection(Collection<Cell> grid, Geometry geometry) {
        return grid.stream().filter((cell) -> cell.polygon.intersects(geometry)).collect(toSet());
    }

    private Geometry toGeometry(double[][] footprint) {
        Coordinate[] coords = Arrays.stream(footprint).map((coord) ->
                new Coordinate(coord[0], coord[1]))
                .toArray(Coordinate[]::new);
        return geometryFactory.createPolygon(coords);
    }

    private static class Cell {
        final Polygon polygon;

        Cell(Polygon polygon) {
            this.polygon = polygon;
        }
    }

    public interface ScoringAlgorithm {
        double score(SceneMetaData scene, double improvement);
    }

    public static class Scene {

    }
}
