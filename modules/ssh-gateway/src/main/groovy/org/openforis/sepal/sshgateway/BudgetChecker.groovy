package org.openforis.sepal.sshgateway

class BudgetChecker {
     static void assertWithinBudget(info) {
        check(info.monthlyInstanceSpending, info.monthlyInstanceBudget, "You have spent more than you have been allocated on instances.")
        check(info.monthlyStorageSpending, info.monthlyStorageBudget, "You have spent more than you have been allocated on storage.")
        check(info.storageUsed, info.storageQuota, "You have used up more storage than you are allocated.")
    }

    private static void check(spending, budget, String message) {
        if (spending > budget) {
            println "\n$message"
            System.exit(1)
        }
    }
}
