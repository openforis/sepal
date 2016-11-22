package org.openforis.sepal.component.files

import groovy.json.JsonParserType
import groovy.json.JsonSlurper
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

class ListApps implements Query<List<Map>> {
}

class ListAppsHandler implements QueryHandler<List<Map>, ListApps> {
    private final File appsFile

    ListAppsHandler(File appsFile) {
        this.appsFile = appsFile
    }

    List<Map> execute(ListApps query) {
        if (!appsFile.exists())
            return []
        def apps = new JsonSlurper(type: JsonParserType.LAX).parse(appsFile) as List<Map>
        validate(apps)
        return apps
    }

    private void validate(apps) {
        assert apps instanceof List, "$appsFile: : Can only contain list of objects: $apps"
        apps.each { app ->
            assert app instanceof Map, "$appsFile: Can only contain list of objects: $app"
            assert app.path instanceof String, "$appsFile: Requires 'path' String property: $app"
            assert app.label instanceof String, "$appsFile: Requires 'label' String property: $app"
        }
    }
}
