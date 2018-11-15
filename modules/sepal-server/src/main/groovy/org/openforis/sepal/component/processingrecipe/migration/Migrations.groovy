package org.openforis.sepal.component.processingrecipe.migration

import groovy.json.JsonOutput
import groovy.transform.ToString
import org.openforis.sepal.component.processingrecipe.api.Recipe

interface Migrations {
    void addMigration(int version, Closure<Map> closure)

    Recipe migrate(Recipe recipe)

    int getCurrentVersion()

    String getType()
}

@ToString
abstract class AbstractMigrations implements Migrations {
    final Map<Integer, Closure<Map>> migrations = [:]
    final String type

    AbstractMigrations(String type) {
        this.type = type
    }

    final void addMigration(int version, Closure<Map> closure) {
        migrations[version] = closure
    }

    final Recipe migrate(Recipe recipe) {
        def contents = migrations.keySet()
            .findAll { it >= recipe.typeVersion }
            .sort()
            .inject(recipe.parsedContents) { acc, typeVersion -> this.migrations[typeVersion](acc) }
        return recipe
            .withContents(JsonOutput.toJson(contents))
            .withTypeVersion(currentVersion)
    }

    final int getCurrentVersion() {
        return (migrations.keySet().max() ?: 0) + 1
    }
}
