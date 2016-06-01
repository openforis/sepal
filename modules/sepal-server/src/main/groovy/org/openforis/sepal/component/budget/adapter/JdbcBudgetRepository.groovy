package org.openforis.sepal.component.budget.adapter

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.InstanceUse
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock

class JdbcBudgetRepository implements BudgetRepository {
    private final SqlConnectionManager connectionManager
    private final Clock clock

    JdbcBudgetRepository(SqlConnectionManager connectionManager, Clock clock) {
        this.connectionManager = connectionManager
        this.clock = clock
    }

    List<InstanceUse> userInstanceUses(String username, int year, int month) {
        sql.rows('''
                SELECT state, instance_type, creation_time, update_time
                FROM instance_use
                WHERE username = :username
                AND YEAR(creation_time) <= :year
                AND YEAR(update_time) >= :year
                AND (YEAR(creation_time) != :year OR MONTH(creation_time) <= :month)
                AND (YEAR(update_time) != :year OR MONTH(update_time) >= :month)
        ''', [username: username, year: year, month: month]).collect {
        def state = it.state
        Date to = state == 'CLOSED' ? it.update_time : clock.now()
        new InstanceUse(
                instanceType: it.instance_type,
                from: it.creation_time,
                to: to
        )
    }
}

Budget userBudget(String username) {
    def row = sql.firstRow('''
                SELECT monthly_instance, monthly_storage, storage_quota
                FROM user_budget
                WHERE username = ?''', username)
    if (!row)
        row = sql.firstRow('''
                SELECT monthly_instance, monthly_storage, storage_quota
                FROM default_user_budget''')
    return toBudget(row)
}

private Budget toBudget(GroovyRowResult row) {
    new Budget(
            instanceSpending: row.monthly_instance,
            storageSpending: row.monthly_storage,
            storageQuota: row.storage_quota
    )
}

void updateDefaultBudget(Budget budget) {
    def params = [budget.instanceSpending, budget.storageSpending, budget.storageQuota]
    def updated = sql.executeUpdate('''
                UPDATE default_user_budget
                SET monthly_instance = ?, monthly_storage = ?, storage_quota = ?''', params)
    if (!updated)
        sql.executeInsert('''
                    INSERT INTO default_user_budget(monthly_instance, monthly_storage, storage_quota)
                    VALUES(?, ?, ?) ''', params)
}

void updateBudget(String username, Budget budget) {
    def params = [budget.instanceSpending, budget.storageSpending, budget.storageQuota, username]
    def updated = sql.executeUpdate('''
                UPDATE user_budget
                SET monthly_instance = ?, monthly_storage = ?, storage_quota = ?
                WHERE username = ?''', params)
    if (!updated)
        sql.executeInsert('''
                    INSERT INTO user_budget(monthly_instance, monthly_storage, storage_quota, username)
                    VALUES(?, ?, ?, ?) ''', params)
}

    private Sql getSql() {
        connectionManager.sql
    }
}
