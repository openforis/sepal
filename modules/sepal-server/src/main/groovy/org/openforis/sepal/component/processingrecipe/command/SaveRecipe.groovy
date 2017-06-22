package org.openforis.sepal.component.processingrecipe.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class SaveRecipe extends AbstractCommand<Void> {
    Recipe recipe
}

class SaveRecipeHandler implements CommandHandler<Void, SaveRecipe> {
    private final RecipeRepository repository

    SaveRecipeHandler(RecipeRepository repository) {
        this.repository = repository
    }

    Void execute(SaveRecipe command) {
        def recipe = command.recipe.creationTime ? command.recipe.updated(new Date()) : command.recipe.created(new Date())
        repository.save(recipe)
        return null
    }
}
