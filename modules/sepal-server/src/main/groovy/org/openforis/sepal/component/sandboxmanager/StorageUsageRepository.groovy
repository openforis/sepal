package org.openforis.sepal.component.sandboxmanager

import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.DateTime

import static ResourceUsageService.MonthlyUsage
import static org.openforis.sepal.util.DateTime.monthOfYear
import static org.openforis.sepal.util.DateTime.year

interface StorageUsageRepository {
    MonthlyUsage lastMonthlyUsage(String username)

    void updateMonthlyUsage(MonthlyUsage monthlyUsage)
}

class JdbcStorageUsageRepository implements StorageUsageRepository {
    private final SqlConnectionManager connectionManager
    private final Clock clock

    JdbcStorageUsageRepository(SqlConnectionManager connectionManager, Clock clock) {
        this.connectionManager = connectionManager
        this.clock = clock
    }

    MonthlyUsage lastMonthlyUsage(String username) {
        def row = sql.firstRow('''
                SELECT gb_hours, storage_used, update_time
                FROM user_monthly_storage
                WHERE username = ?
                ORDER BY year DESC, month DESC
                LIMIT 1''', [username])
        if (row == null)
            row = [gb_hours: 0, storage_used: 0, update_time: DateTime.firstOfMonth(clock.now())]
        return new MonthlyUsage(username, row.gb_hours, row.storage_used, row.update_time)
    }


    void updateMonthlyUsage(MonthlyUsage monthlyUsage) {
        monthlyUsage.with {
            def rowsUpdated = sql.executeUpdate('''
                UPDATE user_monthly_storage
                SET gb_hours = ?, storage_used = ?, update_time = ?
                WHERE username = ? AND year = ? AND month = ?''',
                    [gbHours, storageUsed, updateTime, username, year(updateTime), monthOfYear(updateTime)])
            if (!rowsUpdated)
                sql.executeInsert('''
                        INSERT INTO user_monthly_storage(gb_hours, storage_used, update_time, username, year, month)
                        VALUES (?, ?, ?, ?, ?, ?)''',
                        [gbHours, storageUsed, updateTime, username, year(updateTime), monthOfYear(updateTime)])
        }
    }

    private Sql getSql() {
        new Sql(connectionManager.dataSource)
    }
}