package org.openforis.sepal.component.processingrecipe.adapter

import groovy.sql.GroovyResultSet
import groovy.sql.Sql
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.sql.SqlConnectionProvider

class JdbcRecipeRepository implements RecipeRepository {
    private final SqlConnectionProvider connectionProvider

    JdbcRecipeRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    void save(Recipe recipe) {
        def updated = sql.executeUpdate('''
                UPDATE recipe 
                SET type_version = ?, project_id = ?, name = ?, contents = ?, update_time = ? 
                WHERE id = ? AND username = ?''', [recipe.typeVersion, recipe.projectId, recipe.name, recipe.contents, recipe.updateTime, recipe.id, recipe.username])
        if (!updated)
            sql.executeInsert('''
                INSERT INTO recipe(id, project_id, name, type, type_version, username, contents, creation_time, update_time) 
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)''', [
                    recipe.id, recipe.projectId, recipe.name, recipe.type, recipe.typeVersion, recipe.username, recipe.contents,
                    recipe.creationTime, recipe.updateTime
            ])
    }

    void remove(String id, String username) {
        removeRecipes([id], username)
    }

    void removeRecipes(List<String> ids, String username) {
        sql.execute("UPDATE recipe SET removed = TRUE WHERE id in (${placeholders(ids)}) AND username = ? ", [ids, username].flatten())
    }

    Recipe getById(String id, String username) {
        def recipe = null
        sql.eachRow('''
                SELECT id, project_id, name, type, type_version, username, contents, creation_time, update_time 
                FROM recipe 
                WHERE id = ? AND NOT removed AND username = ? ''', [id, username]) {
            recipe = toRecipe(it)
        }
        return recipe
    }

    void saveProject(Map project) {
        def updated = sql.executeUpdate('''
                UPDATE project
                SET name = ?
                WHERE id = ? AND username = ? ''', [project.name, project.id, project.username])
        if (!updated)
            sql.executeInsert('''
                INSERT INTO project(id, name, username) 
                VALUES(?, ?, ?)''', [
                    project.id, project.name, project.username
            ])
    }

    void removeProject(String id, String username) {
        sql.execute("DELETE FROM project WHERE id = ? AND username = ? ", [id, username])
        sql.execute("UPDATE recipe SET removed = TRUE WHERE project_id = ? AND username = ? ", [id, username].flatten())
    }

    void moveRecipes(String projectId, List<String> recipeIds, String username) {
        sql.execute("UPDATE recipe SET project_id = ? WHERE id in (${placeholders(recipeIds)}) AND username = ? ", [projectId, recipeIds, username].flatten())
    }

    List<Recipe> list(String username) {
        def recipes = []
        sql.eachRow('''
                SELECT id, project_id, name, type, type_version, username, NULL AS contents, creation_time, update_time 
                FROM recipe 
                WHERE username = ? AND NOT removed
                ORDER BY name, update_time desc''', [username]) {
            recipes << toRecipe(it)
        }
        return recipes
    }

    List<Map> listProjects(String username) {
        sql.rows('''
                SELECT id, name, username
                FROM project
                WHERE username = ?
                ORDER BY name ''', [username])
    }

    void eachOfTypeBeforeVersion(String type, int version, Closure callback) {
        sql.eachRow('''
                SELECT id, project_id, name, type, type_version, username, contents, creation_time, update_time 
                FROM recipe 
                WHERE type = ? AND type_version < ? AND NOT removed
                ORDER BY creation_time''', [type, version]) {
            callback(toRecipe(it))
        }
    }

    private Recipe toRecipe(GroovyResultSet row) {
        new Recipe(
                id: row.id,
                projectId: row.project_id,
                name: row.name,
                type: row.type,
                typeVersion: row.type_version,
                username: row.username,
                contents: row.longText('contents'),
                creationTime: new Date(row.creation_time.time),
                updateTime: new Date(row.update_time.time)
        )
    }

    private Sql getSql() {
        connectionProvider.sql
    }

    private placeholders(Collection c) {
        (['?'] * c.size()).join(', ')
    }
}
