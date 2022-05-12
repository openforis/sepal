package org.openforis.sepal.component.processingrecipe.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository

@EqualsAndHashCode(callSuper = true)
@Canonical
class MoveRecipes extends AbstractCommand<Void> {
    String projectId
    List<String> recipeIds
}

class MoveRecipesHandler implements CommandHandler<Void, MoveRecipes> {
    private final RecipeRepository repository

    MoveRecipesHandler(RecipeRepository repository) {
        this.repository = repository
    }

    Void execute(MoveRecipes command) {
        repository.moveRecipes(command.projectId, command.recipeIds, command.username)
        return null
    }
}
