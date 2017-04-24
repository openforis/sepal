package org.openforis.sepal.sshgateway

class BudgetChecker {
     static void assertWithinBudget(info) {
        check(info.monthlyInstanceSpending, info.monthlyInstanceBudget, "You have spent more than you have been allocated on instances. Please contact a system administrator to increase your allocation.")
        check(info.monthlyStorageSpending, info.monthlyStorageBudget, "You have spent more than you have been allocated on storage. Please contact a system administrator to increase your allocation.")
        check(info.storageUsed, info.storageQuota, "You have used up more storage than you are allocated. Please contact a system administrator to increase your allocation.")
    }

    private static void check(spending, budget, String message) {
        if (spending > budget) {
            println "\n$message"
            System.exit(1)
        }
    }
}
