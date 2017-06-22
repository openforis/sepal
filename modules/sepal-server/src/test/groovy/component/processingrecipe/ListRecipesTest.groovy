package component.processingrecipe

class ListRecipesTest extends RecipeTest {
    def 'Saved recipes can be listed'() {
        clock.set()
        def recipe1 = saveRecipe(newRecipe(username: testUsername))
        def recipe2 = saveRecipe(newRecipe(username: testUsername))
        saveRecipe(newRecipe(username: 'anotherUser'))

        expect:
        listRecipes(testUsername) == [recipe1, recipe2]
    }
}
