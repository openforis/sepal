package org.openforis.sepal.component.processingrecipe.migration

import groovy.json.JsonOutput
import org.openforis.sepal.component.processingrecipe.api.Recipe

abstract class Migrations {
    final Map<Integer, Closure<Map>> migrations = [:]
    final Recipe.Type type

    Migrations(Recipe.Type type) {
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


