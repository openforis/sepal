package component.budget

import org.openforis.sepal.component.budget.adapter.UserFiles

class FakeUserFiles implements UserFiles {
    private final gbByUsername = [:] as Map<String, Double>

    double gbUsed(String username) {
        return gbByUsername[username]
    }

    void gbUsed(String username, double gb) {
        gbByUsername[username] = gb
    }
}
