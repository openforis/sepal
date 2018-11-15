package component.processingrecipe

class ListRecipesTest extends RecipeTest {
    def 'Saved recipes can be listed'() {
        clock.set()
        def recipe1 = saveRecipe(newRecipe(username: testUsername, contents: null))
        def recipe2 = saveRecipe(newRecipe(username: testUsername, contents: null))
        saveRecipe(newRecipe(username: 'anotherUser'))

        expect:
        listRecipes(testUsername).toSet() == [recipe1, recipe2].toSet()
    }
}
