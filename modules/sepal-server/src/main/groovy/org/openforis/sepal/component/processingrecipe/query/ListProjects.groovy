package org.openforis.sepal.component.processingrecipe.query

import groovy.transform.Canonical
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Canonical
class ListProjects implements Query<List<Map>> {
    String username
}

class ListProjectsHandler implements QueryHandler<List<Map>, ListProjects> {
    private final RecipeRepository repository

    ListProjectsHandler(RecipeRepository repository) {
        this.repository = repository
    }

    List<Map> execute(ListProjects query) {
        return repository.listProjects(query.username)
    }
}
