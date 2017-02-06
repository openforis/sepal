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
        assert apps instanceof List, "$appsFile: : App list must be list: $apps"
        apps.each { app ->
            if (app.apps)
                validateGroup(app)
            else
                validateApp(app)
        }
    }

    private void validateGroup(group) {
        assert group instanceof Map, "$appsFile: Group must be an object: $group"
        assert group.label instanceof String, "$appsFile: Group requires 'label' String property: $group"
        assert group.apps instanceof List, "$appsFile: Group requires 'apps' array property: $group"
        validate(group.apps)
    }

    private void validateApp(app) {
        assert app instanceof Map, "$appsFile: App must be an object: $app"
        assert app.label instanceof String, "$appsFile: App requires 'label' string property: $app"
        assert app.path instanceof String, "$appsFile: App requires 'path' string property: $app"
    }
}
