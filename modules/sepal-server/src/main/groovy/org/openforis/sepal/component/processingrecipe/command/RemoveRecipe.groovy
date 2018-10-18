package org.openforis.sepal.component.processingrecipe.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository

@EqualsAndHashCode(callSuper = true)
@Canonical
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
