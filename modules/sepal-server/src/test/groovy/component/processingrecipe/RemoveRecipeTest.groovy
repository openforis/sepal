package component.processingrecipe

class RemoveRecipeTest extends RecipeTest {
    def 'When removing recipe, it not in recipe list'() {
        def recipe = saveRecipe(newRecipe())

        when:
        removeRecipe(recipe.id)

        then:
        listRecipes(recipe.username).empty
    }

    def 'When removing recipe, it cannot be loaded'() {
        def recipe = saveRecipe(newRecipe())

        when:
        removeRecipe(recipe.id)

        then:
        !getRecipeById(recipe.id)
    }

    def 'When removing recipe for a different user, it is not removed'() {
        def recipe = saveRecipe(newRecipe(username: 'another-user'))

        when:
        removeRecipe(recipe.id)

        then:
        getRecipeById(recipe.id, 'another-user')
    }

    def 'When removing multiple recipes, they are not in recipe list'() {
        def recipe1 = saveRecipe(newRecipe())
        def recipe2 = saveRecipe(newRecipe())

        when:
        removeRecipes([recipe1.id, recipe2.id])

        then:
        listRecipes(recipe1.username).empty
    }
}
