package frontend

class Wrs2Bounds {
    private final Map<String, Map<String, List<List>>> pathRows

    Wrs2Bounds() {
        def input = getClass().getResourceAsStream('/WRS-2_bound_world.kml')
        def kml = new XmlSlurper().parse(input)
        def pathRows = [:]
        kml.Document.Placemark.each { placemark ->
            def polygon = placemark.Polygon.outerBoundaryIs.LinearRing.coordinates.text().trim()
                    .split(' ')
                    .collect { String s ->
                (s.split(',') as List).subList(0, 2).reverse().collect { it as double }
            } as List<List>
            def sceneAreaId = placemark.name.text()
            pathRows[sceneAreaId] = [
                    sceneAreaId: sceneAreaId,
                    polygon    : polygon
            ]
        }
        this.pathRows = pathRows
    }

    List<Map<String, List<List>>> forSceneAreaIds(Collection<String> sceneAreIds) {
        sceneAreIds.collect { pathRows[it] }
    }
}
