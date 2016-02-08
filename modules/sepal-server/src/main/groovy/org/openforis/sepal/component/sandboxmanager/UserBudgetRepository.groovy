package org.openforis.sepal.component.sandboxmanager

import groovy.sql.Sql
import groovy.transform.ToString
import org.openforis.sepal.transaction.SqlConnectionManager

interface UserBudgetRepository {
    void update(String username, int monthlyInstanceBudget)

    Budget byUsername(String s)
}

@ToString
class JdbcUserBudgetRepository implements UserBudgetRepository {
    private final SqlConnectionManager connectionManager

    JdbcUserBudgetRepository(SqlConnectionManager connectionManager) {
        this.connectionManager = connectionManager
    }

    void update(String username, int monthlyInstanceBudget) {
        def rowsUpdated = sql.executeUpdate('''
                UPDATE user_budget
                SET monthly_instance = ?
                WHERE username = ?''', [monthlyInstanceBudget, username])
        if (!rowsUpdated)
            sql.executeInsert('INSERT INTO user_budget(monthly_instance, username) VALUES(?, ?)',
                    [monthlyInstanceBudget, username])
    }

    Budget byUsername(String username) {
        def row = sql.firstRow('SELECT monthly_instance FROM user_budget WHERE username = ?', [username])
        if (!row)
            return new Budget()
        return new Budget(
                monthlyInstance: row.monthly_instance
        )

    }

    private Sql getSql() {
        connectionManager.sql
    }
}
