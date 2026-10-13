import crypto from 'node:crypto'

import {storedUsername} from '#sepal/username'

import {firstOfYearMonth, monthOfYear as monthOf, plusOneMonth, year as yearOf} from './dateTime.js'
import {
    budget as budgetDto,
    budgetUpdateRequest as budgetUpdateRequestDto,
    instanceUse as instanceUseDto,
    storageUse as storageUseDto,
    userSpendingReport as userSpendingReportDto,
} from './dto.js'

export class BudgetRepository {
    #db
    #clock

    constructor(db, clock) {
        this.#db = db
        this.#clock = clock
    }

    // Only the rows overlapping [firstOfMonth, endOfMonth) can be charged for that month —
    // instanceSpendingCalculator clamps every use to those bounds anyway, so anything outside
    // contributes 0 hours. `open_session_use` is only ever pruned per removed user, so without
    // this predicate the query would grow with every session the user has ever had.
    // An open row (to_time NULL) always qualifies: its end is resolved to `now` below.
    userInstanceUses(username, year, month) {
        return this.#db.withConnection(async connection => {
            const firstOfMonth = firstOfYearMonth(year, month)
            const endOfMonth = plusOneMonth(firstOfMonth)
            const [rows] = await connection.query(
                `SELECT instance_type, from_time, to_time
                    FROM open_session_use
                    WHERE username = ?
                        AND from_time <= ?
                        AND (to_time IS NULL OR to_time >= ?)`,
                [username, endOfMonth, firstOfMonth]
            )
            const now = this.#clock()
            return rows.map(row => instanceUseDto({
                instanceType: row.instance_type,
                from: new Date(row.from_time),
                to: row.to_time ? new Date(row.to_time) : now,
            }))
        })
    }

    userStorageUse(username, year, month) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT gb_hours, storage_used, update_time
                    FROM user_monthly_storage
                    WHERE username = ? AND year = ? AND month = ?`,
                [username, year, month]
            )
            return this.#toStorageUse(rows[0])
        })
    }

    lastUserStorageUse(username) {
        return this.#lastUse('user_monthly_storage', username)
    }

    updateUserStorageUse(username, storageUse) {
        return this.#updateUse('user_monthly_storage', username, storageUse)
    }

    lastUserDataUse(username) {
        return this.#lastUse('user_monthly_data_storage', username)
    }

    updateUserDataUse(username, storageUse) {
        return this.#updateUse('user_monthly_data_storage', username, storageUse)
    }

    userBudget(username) {
        return this.#db.withConnection(connection => this.#userBudget(connection, username))
    }

    updateDefaultBudget(budget) {
        return this.#db.withConnection(async connection => {
            const params = [budget.instanceSpending, budget.storageSpending, budget.storageQuota]
            const [result] = await connection.query(
                `UPDATE default_user_budget
                    SET monthly_instance = ?, monthly_storage = ?, storage_quota = ?`,
                params
            )
            if (!result.affectedRows) {
                await connection.query(
                    `INSERT INTO default_user_budget(monthly_instance, monthly_storage, storage_quota)
                        VALUES(?, ?, ?)`,
                    params
                )
            }
            if (budget.dataQuota != null) {
                await connection.query('UPDATE default_data_quota SET data_quota = ?', [budget.dataQuota])
            }
        })
    }

    updateBudget(username, budget) {
        return this.#db.withConnection(async connection => {
            const params = [
                budget.instanceSpending, budget.storageSpending, budget.storageQuota, budget.dataQuota ?? null,
                storedUsername(username),
            ]
            const [result] = await connection.query(
                `UPDATE user_budget
                    SET monthly_instance = ?, monthly_storage = ?, storage_quota = ?, data_quota = IFNULL(?, data_quota)
                    WHERE username = ?`,
                params
            )
            if (!result.affectedRows) {
                await connection.query(
                    `INSERT INTO user_budget(monthly_instance, monthly_storage, storage_quota, data_quota, username)
                        VALUES(?, ?, ?, ?, ?)`,
                    params
                )
            }
            const [[stored]] = await connection.query(
                `SELECT IFNULL(data_quota, (SELECT data_quota FROM default_data_quota LIMIT 1)) AS data_quota
                    FROM user_budget WHERE username = ?`,
                [storedUsername(username)]
            )
            await this.#closeBudgetUpdateRequest(connection, username, {...budget, dataQuota: stored.data_quota})
        })
    }

    saveSpendingReport(report) {
        return this.#db.withConnection(async connection => {
            await connection.query('DELETE FROM user_spending')
            const entries = Object.values(report)
            for (const entry of entries) {
                await connection.query(
                    `INSERT INTO user_spending
                        (username, instance_spending, storage_spending, storage_usage, data_usage)
                        values (?, ?, ?, ?, ?)`,
                    [entry.username, entry.instanceSpending, entry.storageSpending, entry.storageUsage, entry.dataUsage ?? 0]
                )
            }
        })
    }

    updateSpendingReport(username, report) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE user_spending
                    SET instance_spending = ?, storage_spending = ?, storage_usage = ?, data_usage = ?
                    WHERE username = ?`,
                [report.instanceSpending, report.storageSpending, report.storageUsage, report.dataUsage ?? 0, username]
            )
        })
    }

    requestBudgetUpdate(username, message, requestedBudget) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                `UPDATE budget_update_request
                    SET requested_monthly_instance = ?, requested_monthly_storage = ?, requested_storage_quota = ?, requested_data_quota = ?, message = ?, update_time = ?
                    WHERE username = ? and state = 'PENDING'`,
                [
                    requestedBudget.instanceSpending, requestedBudget.storageSpending, requestedBudget.storageQuota,
                    requestedBudget.dataQuota ?? null, message, this.#clock(), username,
                ]
            )
            if (!result.affectedRows) {
                const initialBudget = await this.#userBudget(connection, username)
                await connection.query(
                    `INSERT INTO budget_update_request(id, initial_monthly_instance, initial_monthly_storage, initial_storage_quota, initial_data_quota, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, requested_data_quota, message, creation_time, update_time, state, username)
                        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        crypto.randomUUID(), initialBudget.instanceSpending, initialBudget.storageSpending,
                        initialBudget.storageQuota, initialBudget.dataQuota, requestedBudget.instanceSpending,
                        requestedBudget.storageSpending, requestedBudget.storageQuota, requestedBudget.dataQuota ?? null, message, this.#clock(), this.#clock(), 'PENDING', storedUsername(username),
                    ]
                )
            }
        })
    }

    budgetUpdateRequest(username) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT requested_monthly_instance, requested_monthly_storage, requested_storage_quota, requested_data_quota, message, creation_time, update_time
                    FROM budget_update_request
                    WHERE username = ? and state = 'PENDING'`,
                [username]
            )
            // Last PENDING row wins.
            return rows.reduce((_acc, row) => toBudgetUpdateRequest(row), null)
        })
    }

    spendingReport() {
        return this.#db.withConnection(async connection => {
            const requests = await this.#budgetUpdateRequests(connection)
            const report = {}
            const [rows] = await connection.query(
                `SELECT u.username, s.instance_spending, s.storage_spending, s.storage_usage, s.data_usage,
                       IFNULL(b.monthly_instance, d.monthly_instance) monthly_instance,
                       IFNULL(b.monthly_storage, d.monthly_storage) monthly_storage,
                       IFNULL(b.storage_quota, d.storage_quota) storage_quota,
                       IFNULL(b.data_quota, (SELECT data_quota FROM default_data_quota LIMIT 1)) data_quota
                FROM (
                    SELECT username FROM user_spending
                    UNION
                    SELECT DISTINCT username FROM budget_update_request
                    UNION
                    SELECT username FROM user_budget
                ) AS u
                LEFT JOIN user_spending s ON s.username = u.username
                JOIN default_user_budget d
                LEFT JOIN user_budget b ON b.username = u.username`
            )
            for (const row of rows) {
                report[row.username] = userSpendingReportDto({
                    username: row.username,
                    instanceSpending: row.instance_spending ?? 0,
                    storageSpending: row.storage_spending ?? 0,
                    storageUsage: row.storage_usage ?? 0,
                    dataUsage: row.data_usage ?? 0,
                    instanceBudget: row.monthly_instance ?? 0,
                    storageBudget: row.monthly_storage ?? 0,
                    storageQuota: row.storage_quota ?? 0,
                    dataQuota: row.data_quota ?? 0,
                    costPerGbMonth: 0,
                    budgetUpdateRequest: requests[row.username],
                })
            }
            return report
        })
    }

    #lastUse(table, username) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT gb_hours, storage_used, update_time
                    FROM ??
                    WHERE username = ?
                    ORDER BY year DESC, month DESC
                    LIMIT 1`,
                [table, username]
            )
            return this.#toStorageUse(rows[0])
        })
    }

    #updateUse(table, username, storageUse) {
        return this.#db.withConnection(async connection => {
            const updateTime = storageUse.updateTime
            const year = yearOf(updateTime)
            const month = monthOf(updateTime)
            const params = [storageUse.gbHours, storageUse.gb, updateTime, storedUsername(username), year, month]
            const [result] = await connection.query(
                `UPDATE ??
                    SET gb_hours = ?, storage_used = ?, update_time = ?
                    WHERE username = ? AND year = ? AND month = ?`,
                [table, ...params]
            )
            if (!result.affectedRows) {
                await connection.query(
                    `INSERT INTO ??(gb_hours, storage_used, update_time, username, year, month)
                        VALUES(?, ?, ?, ?, ?, ?)`,
                    [table, ...params]
                )
            }
        })
    }

    #toStorageUse(row) {
        return storageUseDto({
            gbHours: row?.gb_hours ?? 0,
            gb: row?.storage_used ?? 0,
            updateTime: row?.update_time ? new Date(row.update_time) : this.#clock(),
        })
    }

    async #userBudget(connection, username) {
        const [userRows] = await connection.query(
            `SELECT b.monthly_instance, b.monthly_storage, b.storage_quota,
                    IFNULL(b.data_quota, (SELECT data_quota FROM default_data_quota LIMIT 1)) AS data_quota
                FROM user_budget b
                WHERE b.username = ?`,
            [username]
        )
        let row = userRows[0]
        if (!row) {
            const [defaultRows] = await connection.query(
                `SELECT monthly_instance, monthly_storage, storage_quota,
                        (SELECT data_quota FROM default_data_quota LIMIT 1) AS data_quota
                    FROM default_user_budget`
            )
            row = defaultRows[0]
        }
        return toBudget(row)
    }

    #closeBudgetUpdateRequest(connection, username, finalBudget) {
        return connection.query(
            `UPDATE budget_update_request
                SET final_monthly_instance = ?, final_monthly_storage = ?, final_storage_quota = ?, final_data_quota = ?, update_time = ?, state = 'CLOSED'
                WHERE username = ? and state = 'PENDING'`,
            [finalBudget.instanceSpending, finalBudget.storageSpending, finalBudget.storageQuota, finalBudget.dataQuota, this.#clock(), username]
        )
    }

    async #budgetUpdateRequests(connection) {
        const [rows] = await connection.query(
            `SELECT username, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, requested_data_quota, message, creation_time, update_time
                FROM budget_update_request
                WHERE state = 'PENDING'`
        )
        const requests = {}
        for (const row of rows) {
            requests[row.username] = toBudgetUpdateRequest(row)
        }
        return requests
    }
}

const toBudgetUpdateRequest = row => budgetUpdateRequestDto({
    message: row.message,
    instanceSpending: row.requested_monthly_instance,
    storageSpending: row.requested_monthly_storage,
    storageQuota: row.requested_storage_quota,
    dataQuota: row.requested_data_quota,
    creationTime: toDate(row.creation_time),
    updateTime: toDate(row.update_time),
})

const toDate = value => value ? new Date(value) : null

const toBudget = row => budgetDto({
    instanceSpending: row.monthly_instance,
    storageSpending: row.monthly_storage,
    storageQuota: row.storage_quota,
    dataQuota: row.data_quota,
})
