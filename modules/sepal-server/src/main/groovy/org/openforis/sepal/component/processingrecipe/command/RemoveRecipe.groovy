package org.openforis.sepal.component.processingrecipe.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class RemoveRecipe extends AbstractCommand<Void> {
    String id
}

class RemoveRecipeHandler implements CommandHandler<Void, RemoveRecipe> {
    private final RecipeRepository repository

    RemoveRecipeHandler(RecipeRepository repository) {
        this.repository = repository
    }

    Void execute(RemoveRecipe command) {
        repository.remove(command.id)
        return null
    }
}
