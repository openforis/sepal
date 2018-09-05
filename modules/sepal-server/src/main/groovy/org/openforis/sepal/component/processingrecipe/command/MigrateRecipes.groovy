package org.openforis.sepal.component.processingrecipe.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.component.processingrecipe.migration.Migrations

class MigrateRecipes extends AbstractCommand<Void> {
    Migrations migrations
}

class MigrateRecipesHandler implements CommandHandler<Void, MigrateRecipes> {
    private final RecipeRepository repository

    MigrateRecipesHandler(RecipeRepository repository) {
        this.repository = repository
    }

    Void execute(MigrateRecipes command) {
        def migrations = command.migrations
        repository.eachOfTypeBeforeVersion(migrations.type, migrations.currentVersion) { Recipe recipe ->
            def migratedRecipe = migrations.migrate(recipe)
            repository.save(migratedRecipe)
        }
        return null
    }
}
