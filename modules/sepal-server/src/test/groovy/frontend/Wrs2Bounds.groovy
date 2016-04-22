package frontend

class Wrs2Bounds {
    private final Map<String, Map<String, List<List>>> pathRows

    Wrs2Bounds() {
        def input = getClass().getResourceAsStream('/WRS-2_bound_world.kml')
        def kml = new XmlSlurper().parse(input)
        def pathRows = [:]
        kml.Document.Placemark.each { placemark ->
            def coordinates = placemark.Polygon.outerBoundaryIs.LinearRing.coordinates.text().trim()
                    .split(' ')
                    .collect { String s ->
                (s.split(',') as List).subList(0, 2)
            }.subList(0, 4) as List<List>
            def sceneAreaId = placemark.name.text()
            pathRows[sceneAreaId] = [
                    sceneAreaId         : sceneAreaId,
                    lowerLeftCoordinate : [coordinates[3][1], coordinates[3][0]],
                    upperLeftCoordinate : [coordinates[0][1], coordinates[0][0]],
                    upperRightCoordinate: [coordinates[1][1], coordinates[1][0]],
                    lowerRightCoordinate: [coordinates[2][1], coordinates[2][0]],
            ]
        }
        this.pathRows = pathRows
    }

    List<Map<String, List<List>>> forSceneAreaIds(Collection<String> sceneAreIds) {
        sceneAreIds.collect { pathRows[it] }
    }
}
