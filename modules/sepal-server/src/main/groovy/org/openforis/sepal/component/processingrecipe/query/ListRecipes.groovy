package org.openforis.sepal.component.processingrecipe.query

import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.Data

@Data
class ListRecipes implements Query<List<Recipe>> {
    String username
}

class ListRecipesHandler implements QueryHandler<List<Recipe>, ListRecipes> {
    private final RecipeRepository repository

    ListRecipesHandler(RecipeRepository repository) {
        this.repository = repository
    }

    List<Recipe> execute(ListRecipes query) {
        return repository.list(query.username)
    }
}
