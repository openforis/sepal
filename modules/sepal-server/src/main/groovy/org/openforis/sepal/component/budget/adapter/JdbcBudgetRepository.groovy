package org.openforis.sepal.component.budget.adapter

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.component.budget.api.*
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.DateTime

import java.sql.Timestamp

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

        closeBudgetUpdateRequest(username, budget)
    }

    void saveSpendingReport(Map<String, UserSpendingReport> report) {
        sql.execute('DELETE FROM user_spending')
        sql.withBatch('''
            INSERT INTO user_spending 
                (username, instance_spending, storage_spending, storage_usage)
                values (?, ?, ?, ?)''') { ps ->
            report.values().forEach {
                ps.addBatch([it.username, it.instanceSpending, it.storageSpending, it.storageUsage])
            }
        }
    }

    void updateSpendingReport(String username, UserSpendingReport report) {
        sql.executeUpdate('''
            UPDATE user_spending 
            SET instance_spending = ?, storage_spending = ?, storage_usage = ? 
            WHERE username = ?''', [report.instanceSpending, report.storageSpending, report.storageUsage, username])
    }

    void requestBudgetUpdate(String username, String message, Budget requestedBudget) {
        def updated = sql.executeUpdate('''
            UPDATE budget_update_request 
            SET requested_monthly_instance = ?, requested_monthly_storage = ?, requested_storage_quota = ?, message = ?, update_time = ?  
            WHERE username = ? and state = 'PENDING' 
            ''', [
                requestedBudget.instanceSpending, requestedBudget.storageSpending, requestedBudget.storageQuota,
                message, clock.now(), username
        ])

        if (!updated) {
            def initialBudget = userBudget(username)
            sql.executeInsert('''
                    INSERT INTO budget_update_request(id, initial_monthly_instance, initial_monthly_storage, initial_storage_quota, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, message, creation_time, update_time, state, username)
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', [
                    UUID.randomUUID().toString(), initialBudget.instanceSpending, initialBudget.storageSpending,
                    initialBudget.storageQuota, requestedBudget.instanceSpending, requestedBudget.storageSpending,
                    requestedBudget.storageQuota, message, clock.now(), clock.now(), 'PENDING', username
            ])
        }
    }

    private void closeBudgetUpdateRequest(String username, Budget finalBudget) {
        sql.executeUpdate('''
            UPDATE budget_update_request 
            SET final_monthly_instance = ?, final_monthly_storage = ?, final_storage_quota = ?, update_time = ?, state = 'CLOSED'  
            WHERE username = ? and state = 'PENDING' 
            ''', [finalBudget.instanceSpending, finalBudget.storageSpending, finalBudget.storageQuota, clock.now(), username])
    }

    BudgetUpdateRequest budgetUpdateRequest(String username) {
        def request = null
        sql.eachRow('''
                SELECT requested_monthly_instance, requested_monthly_storage, requested_storage_quota, message, creation_time, update_time
                FROM budget_update_request
                WHERE username = ? and state = 'PENDING' 
                ''', [username]) {
            request = toBudgetUpdateRequest(it)
        }
        return request
    }

    Map<String, UserSpendingReport> spendingReport() {
        def requests = budgetUpdateRequests()
        def report = [:]
        sql.rows('''
            SELECT u.username, s.instance_spending, s.storage_spending, s.storage_usage, 
                   IFNULL(b.monthly_instance, d.monthly_instance) monthly_instance,
                   IFNULL(b.monthly_storage, d.monthly_storage) monthly_storage,
                   IFNULL(b.storage_quota, d.storage_quota) storage_quota
            FROM (
                SELECT username FROM user_spending
                UNION
                SELECT DISTINCT username FROM budget_update_request
                UNION
                SELECT username FROM user_budget
            ) AS u
            LEFT JOIN user_spending s ON s.username = u.username
            JOIN default_user_budget d
            LEFT JOIN user_budget b ON b.username = u.username
            ''').each {
            report[it.username] = new UserSpendingReport(
                    username: it.username,
                    instanceSpending: it.instance_spending ?: 0,
                    storageSpending: it.storage_spending?: 0,
                    storageUsage: it.storage_usage?: 0,
                    instanceBudget: it.monthly_instance ?: 0,
                    storageBudget: it.monthly_storage ?: 0,
                    storageQuota: it.storage_quota ?: 0,
                    budgetUpdateRequest: requests[it.username]
            )
        }
        return report
    }

    private Map<String, BudgetUpdateRequest> budgetUpdateRequests() {
        def requests = [:]
        sql.eachRow('''
                SELECT username, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, message, creation_time, update_time
                FROM budget_update_request
                WHERE state = 'PENDING' 
                ''') {
            requests[it.username] = toBudgetUpdateRequest(it)
        }
        return requests
    }

    private BudgetUpdateRequest toBudgetUpdateRequest(row) {
        new BudgetUpdateRequest(
                message: row.longText('message'),
                instanceSpending: row.requested_monthly_instance,
                storageSpending: row.requested_monthly_storage,
                storageQuota: row.requested_storage_quota,
                creationTime: toDate(row.creation_time),
                updateTime: toDate(row.update_time)
        )
    }

    private Date toDate(date) {
        return date ? new Date((date as Timestamp).time) : null
    }

    private Sql getSql() {
        connectionManager.sql
    }
}
