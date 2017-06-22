package org.openforis.sepal.component.processingrecipe.query

import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.Data

@Data
class LoadRecipe implements Query<Recipe> {
    String id
}

class LoadRecipeHandler implements QueryHandler<Recipe, LoadRecipe> {
    private final RecipeRepository repository

    LoadRecipeHandler(RecipeRepository repository) {
        this.repository = repository
    }

    Recipe execute(LoadRecipe query) {
        return repository.getById(query.id)
    }
}
