package org.openforis.sepal.component.processingrecipe.api

interface RecipeRepository {

    void save(Recipe recipe)

    void remove(String id, String username)

    void removeRecipes(List<String> ids, String username)

    Recipe getById(String id, String username)

    List<Recipe> list(String username)

    void eachOfTypeBeforeVersion(String type, int version, Closure callback)

    void saveProject(Map project)

    void removeProject(String id, String username)

    void moveRecipes(String projectId, List<String> recipeIds, String username)

    List<Map> listProjects(String username)
}