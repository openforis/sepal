package org.openforis.sepal.component.processingrecipe.command


import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.component.processingrecipe.migration.Migrations
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@ToString
class MigrateRecipes extends AbstractCommand<Void> {
    Migrations migrations
}

class MigrateRecipesHandler implements CommandHandler<Void, MigrateRecipes> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final RecipeRepository repository

    MigrateRecipesHandler(RecipeRepository repository) {
        this.repository = repository
    }

    Void execute(MigrateRecipes command) {
        def migrations = command.migrations
        println("******** MigrateRecipes ${command}")
        repository.eachOfTypeBeforeVersion(migrations.type, migrations.currentVersion) { Recipe recipe ->
            try {
                println("******** Migrating ${recipe}")
                LOG.info("Migrating ${recipe}")
                def migratedRecipe = migrations.migrate(recipe)
                repository.save(migratedRecipe)
            } catch (Exception e) {
                LOG.warn("Failed to migrate recipe: $recipe", e)
            }
        }
        return null
    }
}
