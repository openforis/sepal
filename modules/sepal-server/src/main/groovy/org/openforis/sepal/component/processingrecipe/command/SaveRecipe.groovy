package org.openforis.sepal.component.processingrecipe.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.component.processingrecipe.migration.Migrations
import org.openforis.sepal.util.Clock

@EqualsAndHashCode(callSuper = true)
@Canonical
class SaveRecipe extends AbstractCommand<Void> {
    Recipe recipe
}

class SaveRecipeHandler implements CommandHandler<Void, SaveRecipe> {
    private final RecipeRepository repository
    private final Clock clock
    private Map<String, Migrations> migrationsByRecipeType

    SaveRecipeHandler(RecipeRepository repository, Map<String, Migrations> migrationsByRecipeType, Clock clock) {
        this.repository = repository
        this.migrationsByRecipeType = migrationsByRecipeType
        this.clock = clock
    }

    Void execute(SaveRecipe command) {
        def recipe = command.recipe.creationTime ? command.recipe.updated(clock.now()) : command.recipe.created(clock.now())
        def migrations = migrationsByRecipeType[recipe.type]
        repository.save(recipe.withTypeVersion(migrations ? migrations.currentVersion : 1))
        return null
    }
}
