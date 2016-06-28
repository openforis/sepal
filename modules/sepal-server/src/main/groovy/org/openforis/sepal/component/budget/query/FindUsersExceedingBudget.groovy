package org.openforis.sepal.component.budget.query

import org.openforis.sepal.component.budget.command.CheckUserInstanceSpending
import org.openforis.sepal.component.budget.command.CheckUserInstanceSpendingHandler
import org.openforis.sepal.component.budget.command.CheckUserStorageUse
import org.openforis.sepal.component.budget.command.CheckUserStorageUseHandler
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.user.UserRepository

class FindUsersExceedingBudget implements Query<Collection<String>> {

}

class FindUsersExceedingBudgetHandler implements QueryHandler<Collection<String>, FindUsersExceedingBudget> {
    private final UserRepository userRepository
    private final CheckUserInstanceSpendingHandler instanceSpendingChecker
    private final CheckUserStorageUseHandler storageUseChecker

    FindUsersExceedingBudgetHandler(
            UserRepository userRepository,
            CheckUserInstanceSpendingHandler instanceSpendingChecker,
            CheckUserStorageUseHandler storageUseChecker) {
        this.userRepository = userRepository
        this.instanceSpendingChecker = instanceSpendingChecker
        this.storageUseChecker = storageUseChecker
    }

    Collection<String> execute(FindUsersExceedingBudget query) {
        def usersExceedingBudget = []
        userRepository.eachUsername { username ->
            def instanceSpending = instanceSpendingChecker.execute(new CheckUserInstanceSpending(username: username))
            if (instanceSpending.budgetExceeded)
                usersExceedingBudget << username
            else {
                def storageSpending = storageUseChecker.execute(new CheckUserStorageUse(username: username))
                if (storageSpending.budgetExceeded || storageSpending.quotaExceeded)
                    usersExceedingBudget << username
            }
        }
        return usersExceedingBudget
    }
}
