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
//
//    void updateForAllUsers(StorageUsageChecker storageUsageChecker) {
//        def now = clock.now()
//        def firstOfMonth = firstOfMonth(now)
//        sql.eachRow('SELECT username FROM users') {
//            def username = it.username as String
//            def usage = storageUsageChecker.determineUsage(username)
//            def currentMonthRow = sql.firstRow('''
//                SELECT storage_used
//                FROM user_monthly_storage
//                WHERE username = ? AND year = ? AND month = ?''',
//                    [username, year(firstOfMonth), monthOfYear(firstOfMonth)])
//            if (currentMonthRow) {
//
//            } else {
//                def lastRow = sql.firstRow('''
//                SELECT storage_used
//                FROM user_monthly_storage
//                WHERE username = ?
//                ORDER BY year DESC, month DESC
//                LIMIT 1''', [username])
//
//                if (!lastRow) {
//                    // Assume current usage, and beginning of month
//                } else {
//
//                }
//            }
//
////            def last = sql.firstRow('''
////                    SELECT gb_hours, update_time
////                    FROM user_monthly_gb_hours
////                    WHERE username = ?
////                    ORDER BY year DESC, month DESC
////                    LIMIT 1''')
//            // If there is a row, calculate and update
//
//        }
//    }

    private Sql getSql() {
        new Sql(connectionManager.dataSource)
    }
}