package org.openforis.sepal.component.sandboxmanager

import groovy.sql.Sql
import groovy.transform.ToString
import org.openforis.sepal.transaction.SqlConnectionManager

interface UserBudgetRepository {
    void update(String username, Budget budget)

    Budget byUsername(String username)
}

@ToString
class JdbcUserBudgetRepository implements UserBudgetRepository {
    private final SqlConnectionManager connectionManager
    private final Budget defaultBudget = new Budget(monthlyInstance: 10, monthlyStorage: 10, storageQuota: 100)

    JdbcUserBudgetRepository(SqlConnectionManager connectionManager) {
        this.connectionManager = connectionManager
    }

    void update(String username, Budget budget) {
        def rowsUpdated = sql.executeUpdate('''
                UPDATE user_budget
                SET monthly_instance = ?, monthly_storage = ?, storage_quota = ?
                WHERE username = ?''', [budget.monthlyInstance, budget.monthlyStorage, budget.storageQuota, username])
        if (!rowsUpdated)
            sql.executeInsert('''
                    INSERT INTO user_budget(monthly_instance, monthly_storage, storage_quota, username)
                    VALUES(?, ?, ?, ?)''',
                    [budget.monthlyInstance, budget.monthlyStorage, budget.storageQuota, username])
    }

    Budget byUsername(String username) {
        def row = sql.firstRow('SELECT monthly_instance, monthly_storage, storage_quota FROM user_budget WHERE username = ?', [username])
        if (!row)
            return defaultBudget
        return new Budget(
                monthlyInstance: row.monthly_instance,
                monthlyStorage: row.monthly_storage,
                storageQuota: row.storage_quota
        )

    }

    private Sql getSql() {
        connectionManager.sql
    }
}
