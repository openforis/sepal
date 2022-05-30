package org.openforis.sepal.component.processingrecipe.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.command.*
import org.openforis.sepal.component.processingrecipe.query.*
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.zip.GZIPInputStream

import static groovy.json.JsonOutput.toJson

class ProcessingRecipeEndpoint {
    private static final Logger LOG = LoggerFactory.getLogger(ProcessingRecipeEndpoint)
    private final Component component

    ProcessingRecipeEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {
            post('/processing-recipes/project/{id}') {
                def recipeIds = jsonBody(List)
                component.submit(new MoveRecipes(
                    projectId: params.id, 
                    recipeIds: recipeIds, 
                    username: sepalUser.username
                ))
                send(recipesJson(sepalUser.username))
            }

            delete('/processing-recipes/project/{id}') {
                component.submit(new RemoveProject(
                        id: params.id,
                        username: sepalUser.username
                ))
                def projects = component.submit(new ListProjects(sepalUser.username))
                send(toJson(projects))
            }

            post('/processing-recipes/project') {
                component.submit(new SaveProject([
                        id: params.id,
                        name: params.name,
                        username: sepalUser.username,
                        defaultAssetFolder: params.defaultAssetFolder,
                        defaultWorkspaceFolder: params.defaultWorkspaceFolder
                ]))
                def projects = component.submit(new ListProjects(sepalUser.username))
                send(toJson(projects))
            }

            get('/processing-recipes/project') {
                def projects = component.submit(new ListProjects(sepalUser.username))
                send(toJson(projects))
            }
            
            post('/processing-recipes/{id}') {
                def contents = new GZIPInputStream(request.inputStream).getText('UTF-8')
                component.submit(new SaveRecipe(new Recipe(
                        id: params.id,
                        projectId: params.projectId,
                        name: params.name,
                        type: params.type,
                        username: sepalUser.username,
                        contents: contents
                )))
                send(recipesJson(sepalUser.username))
            }

            delete('/processing-recipes/{id}') {
                component.submit(new RemoveRecipe(params.id, sepalUser.username))
                send(recipesJson(sepalUser.username))
            }

            get('/processing-recipes/{id}') {
                def recipe = component.submit(new LoadRecipe(params.id))
                if (!recipe)
                    return halt(404)
                if (recipe.username != sepalUser.username && !sepalUser.admin) {
                    LOG.warn("User $sepalUser.username tries to load recipe from other user: $recipe")
                    return halt(404)
                }
                send(recipe.contents)
            }

            get('/processing-recipes') {
                send(recipesJson(sepalUser.username))
            }

            delete('/processing-recipes') {
                def ids = jsonBody(List)
                component.submit(new RemoveRecipes(ids: ids, username: sepalUser.username))
                send(recipesJson(sepalUser.username))
            }
        }
    }

    private String recipesJson(String username) {
        def recipes = component.submit(new ListRecipes(username))
        return toJson(recipes.collect {
            [
                    id          : it.id,
                    projectId   : it.projectId,
                    name        : it.name,
                    type        : it.type,
                    creationTime: it.creationTime,
                    updateTime  : it.updateTime
            ]
        })
    }

    private fromJson(String json) {
        new JsonSlurper().parseText(json)
    }
}
