package org.openforis.sepal.component.datasearch.internal;

import com.vividsolutions.jts.geom.Coordinate;
import com.vividsolutions.jts.geom.Geometry;
import com.vividsolutions.jts.geom.GeometryFactory;
import com.vividsolutions.jts.geom.Polygon;

import java.util.*;
import java.util.function.Function;

import static java.util.Comparator.comparingDouble;
import static java.util.stream.Collectors.toMap;
import static java.util.stream.Collectors.toSet;

public class Scenes {
    private static final int GRID_WIDTH = 32;
    private static final double GRID_GAP = 0.00000001;
    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final List<Scene> scenes;
    private final Collection<Cell> cells;

    public Scenes(List<Scene> scenes) {
        this.scenes = scenes;
        cells = createCells();
    }

    public List<Scene> selectScenes(
            double minCoverage,
            int minScenes,
            int maxScenes,
            ScoringAlgorithm scoringAlgorithm) {

        double cellAreaFactor = 1d / cells.size();
        Map<Cell, Double> coverageByCell = cells.stream().collect(toMap(
                Function.identity(),
                cell -> 0d
        ));
        Map<Scene, Collection<Cell>> cellsByScene = cellsByScene(scenes);

        List<Scene> selected = new ArrayList<>();
        Set<Scene> leftToCheck = new LinkedHashSet<>(scenes); // Keeps initial order, but have efficient removes

        double totalCoverage = 0;
        while (!leftToCheck.isEmpty() && selected.size() < maxScenes
                && (selected.size() < minScenes || totalCoverage < minCoverage)) {
            Map<Scene, Double> scoreByScene = leftToCheck.stream().collect(toMap(
                    Function.identity(),
                    scene -> {
                        Set<Cell> cellsWithoutCoverage = new HashSet<>();
                        Collection<Cell> cells = cellsByScene.get(scene);
                        double totalImprovement = cells.stream().mapToDouble((cell) -> {
                            double cellCoverage = coverageByCell.get(cell);
                            double improvement = (1 - cellCoverage) * (1 - scene.cloudCover);
                            if (improvement <= 0)
                                cellsWithoutCoverage.add(cell);
                            return improvement;
                        }).sum() * cellAreaFactor;
                        // No need to keep on checking cells that a scene provide no improvement for
                        cells.removeAll(cellsWithoutCoverage);
                        return scoringAlgorithm.score(scene, totalImprovement);
                    }));
            Scene scene = scoreByScene.entrySet().stream().max(comparingDouble(Map.Entry::getValue)).get().getKey();
            selected.add(scene);
            leftToCheck.remove(scene);

            cellsByScene.get(scene).forEach(cell -> {
                Double cellCoverage = coverageByCell.get(cell);
                double improvement = (1 - cellCoverage) * (1 - scene.cloudCover);
                coverageByCell.put(cell, cellCoverage + improvement);
            });
            totalCoverage = coverageByCell.values().stream().mapToDouble(Double::doubleValue).sum() * cellAreaFactor;
        }
        return selected;
    }

    private Map<Scene, Collection<Cell>> cellsByScene(List<Scene> scenes) {
        return scenes.stream().collect(toMap(
                Function.identity(),
                scene -> intersection(cells, scene.footprint)
        ));
    }

    @SuppressWarnings("ConstantConditions")
    private Collection<Cell> createCells() {
        return new ArrayList<Cell>();
//        Geometry aoi = geometryFactory.createGeometryCollection(null);
//        for (Scene scene : scenes) {
//            Polygon polygon = createPolygon(scene.footprint); // TODO: Don't do this twice
//            aoi = aoi.union(polygon);
//        }
//
//        aoi = aoi.convexHull();
//        Arrays.stream(aoi.getCoordinates());
//
//
//        DoubleSummaryStatistics xStats = tileFootprint.stream().mapToDouble((coord) -> coord.get(0)).summaryStatistics();
//        DoubleSummaryStatistics yStats = tileFootprint.stream().mapToDouble((coord) -> coord.get(1)).summaryStatistics();
//        double minX = xStats.getMin();
//        double maxX = xStats.getMax();
//        double minY = yStats.getMin();
//        double maxY = yStats.getMax();
//        double xStep = (maxX - minX) / (double) GRID_WIDTH;
//        double yStep = (maxY - minY) / (double) GRID_WIDTH;
////
//        List<Cell> grid = new ArrayList<>(GRID_WIDTH * GRID_WIDTH);
//        for (int ix = 0; ix < GRID_WIDTH; ix++) {
//            double x = minX + ix * xStep + GRID_GAP;
//            for (int iy = 0; iy < GRID_WIDTH; iy++) {
//                double y = minY + iy * yStep + GRID_GAP;
//                Cell cell = new Cell(geometryFactory.createPolygon(new Coordinate[]{
//                        new Coordinate(x, y),
//                        new Coordinate(x + xStep, y),
//                        new Coordinate(x + xStep, y + yStep),
//                        new Coordinate(x, y + yStep),
//                        new Coordinate(x, y)
//                }));
//                grid.add(cell);
//            }
//        }
//        return intersection(grid, tileFootprint);
    }

    private Set<Cell> intersection(Collection<Cell> grid, List<List<Double>> footprint) {
        Polygon polygon = createPolygon(footprint);
        return grid.stream().filter((cell) -> cell.polygon.intersects(polygon)).collect(toSet());
    }

    private Polygon createPolygon(List<List<Double>> footprint) {
        try {
            Coordinate[] coords = footprint.stream().map((coord) ->
                    new Coordinate(coord.get(0), coord.get(1)))
                    .toArray(Coordinate[]::new);
            return geometryFactory.createPolygon(coords);
        } catch (Exception e) {
            throw e;
        }
    }

    private static class Cell {
        final Polygon polygon;

        Cell(Polygon polygon) {
            this.polygon = polygon;
        }
    }

    public interface ScoringAlgorithm {
        double score(Scene scene, double improvement);
    }
}
