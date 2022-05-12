package org.openforis.sepal.component.processingrecipe.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository

@EqualsAndHashCode(callSuper = true)
@Canonical
class RemoveRecipes extends AbstractCommand<Void> {
    List<String> ids
}

class RemoveRecipesHandler implements CommandHandler<Void, RemoveRecipes> {
    private final RecipeRepository repository

    RemoveRecipesHandler(RecipeRepository repository) {
        this.repository = repository
    }

    Void execute(RemoveRecipes command) {
        repository.removeRecipes(command.ids, command.username)
        return null
    }
}
