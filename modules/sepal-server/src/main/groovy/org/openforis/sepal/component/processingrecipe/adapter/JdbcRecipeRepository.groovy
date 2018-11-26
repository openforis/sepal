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
                SET type_version = ?, name = ?, contents = ?, update_time = ? 
                WHERE id = ?''', [recipe.typeVersion, recipe.name, recipe.contents, recipe.updateTime, recipe.id])
        if (!updated)
            sql.executeInsert('''
                INSERT INTO recipe(id, name, type, type_version, username, contents, creation_time, update_time) 
                VALUES(?, ?, ?, ?, ?, ?, ?, ?)''', [
                    recipe.id, recipe.name, recipe.type, recipe.typeVersion, recipe.username, recipe.contents,
                    recipe.creationTime, recipe.updateTime
            ])
    }

    void remove(String id) {
        sql.execute('UPDATE recipe SET removed = TRUE WHERE id = ? ', [id])
    }

    Recipe getById(String id) {
        def recipe = null
        sql.eachRow('''
                SELECT id, name, type, type_version, username, contents, creation_time, update_time 
                FROM recipe 
                WHERE id = ? AND NOT removed''', [id]) {
            recipe = toRecipe(it)
        }
        return recipe
    }

    List<Recipe> list(String username) {
        def recipes = []
        sql.eachRow('''
                SELECT id, name, type, type_version, username, NULL AS contents, creation_time, update_time 
                FROM recipe 
                WHERE username = ? AND NOT removed
                ORDER BY lower(name), update_time desc
                LIMIT 100''', [username]) {
            recipes << toRecipe(it)
        }
        return recipes
    }

    void eachOfTypeBeforeVersion(String type, int version, Closure callback) {
        sql.eachRow('''
                SELECT id, name, type, type_version, username, contents, creation_time, update_time 
                FROM recipe 
                WHERE type = ? AND type_version < ? AND NOT removed
                ORDER BY creation_time''', [type, version]) {
            callback(toRecipe(it))
        }
    }

    private Recipe toRecipe(GroovyResultSet row) {
        new Recipe(
                id: row.id,
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
}
