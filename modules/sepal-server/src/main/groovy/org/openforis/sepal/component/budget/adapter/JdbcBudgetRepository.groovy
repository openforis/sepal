package org.openforis.sepal.component.budget.adapter

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.InstanceUse
import org.openforis.sepal.component.budget.api.StorageUse
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.DateTime

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

    StorageUse userStorageUse(String username, int year, int month) {
        def row = sql.firstRow('''
                SELECT gb_hours, storage_used, update_time
                FROM user_monthly_storage
                WHERE username = ? AND year = ? AND month = ?''', [username, year, month])
        toStorageUse(row)
    }

    StorageUse lastUserStorageUse(String username) {
        def row = sql.firstRow('''
                SELECT gb_hours, storage_used, update_time
                FROM user_monthly_storage
                WHERE username = ?
                ORDER BY year DESC, month DESC
                LIMIT 1''', [username])
        toStorageUse(row)
    }


    void updateUserStorageUse(String username, StorageUse storageUse) {
        def updateTime = storageUse.updateTime
        def year = DateTime.year(updateTime)
        def month = DateTime.monthOfYear(updateTime)
        def params = [storageUse.gbHours, storageUse.gb, updateTime, username, year, month]
        def updated = sql.executeUpdate('''
                UPDATE user_monthly_storage
                SET gb_hours = ?, storage_used = ?, update_time = ?
                WHERE username = ? AND year = ? AND month = ?''', params)
        if (!updated)
            sql.executeInsert('''
                    INSERT INTO user_monthly_storage(gb_hours, storage_used, update_time, username, year, month)
                    VALUES(?, ?, ?, ?, ?, ?)''', params)
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

    private StorageUse toStorageUse(GroovyRowResult row) {
        new StorageUse(
                gbHours: row?.gb_hours ?: 0,
                gb: row?.storage_used ?: 0,
                updateTime: row?.update_time ?: clock.now())
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

    void saveSpendingReport(Map<String, UserSpendingReport> report) {
        sql.execute('DELETE FROM USER_SPENDING')
        sql.withBatch('''
            INSERT INTO USER_SPENDING 
                (username, instance_spending, storage_spending, storage_usage)
                values (?, ?, ?, ?)''') {ps ->
            report.values().forEach {
                ps.addBatch([it.username, it.instanceSpending, it.storageSpending, it.storageUsage])
            }
        }
    }

    Map<String, UserSpendingReport> spendingReport() {
        def report = [:]
        sql.rows('''
            SELECT s.username, s.instance_spending, s.storage_spending, s.storage_usage, 
                   IFNULL(b.monthly_instance, d.monthly_instance) monthly_instance,
                   IFNULL(b.monthly_storage, d.monthly_storage) monthly_storage,
                   IFNULL(b.storage_quota, d.storage_quota) storage_quota
            FROM user_spending s
            JOIN default_user_budget d
            LEFT JOIN user_budget b ON s.username = b.username
            ''').each {
            report[it.username] = new UserSpendingReport(
                username: it.username,
                instanceSpending: it.instance_spending,
                storageSpending: it.storage_spending,
                storageUsage: it.storage_usage,
                instanceBudget: it.monthly_instance,
                storageBudget: it.monthly_storage,
                storageQuota: it.storage_quota
            )
        }
        return report
    }

    private Sql getSql() {
        connectionManager.sql
    }
}
