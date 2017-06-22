package org.openforis.sepal.component.processingrecipe.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class SaveRecipe extends AbstractCommand<Void> {
    Recipe recipe
}

class SaveRecipeHandler implements CommandHandler<Void, SaveRecipe> {
    private final RecipeRepository repository
    private final Clock clock

    SaveRecipeHandler(RecipeRepository repository, Clock clock) {
        this.repository = repository
        this.clock = clock
    }

    Void execute(SaveRecipe command) {
        def recipe = command.recipe.creationTime ? command.recipe.updated(clock.now()) : command.recipe.created(clock.now())
        repository.save(recipe)
        return null
    }
}
