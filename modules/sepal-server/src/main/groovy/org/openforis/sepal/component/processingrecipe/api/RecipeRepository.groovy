package org.openforis.sepal.component.processingrecipe.api

interface RecipeRepository {

    void save(Recipe recipe)

    void remove(String id)

    Recipe getById(String id)

    List<Recipe> list(String username)

    void eachOfTypeBeforeVersion(String type, int version, Closure callback)
}