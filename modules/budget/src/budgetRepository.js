import crypto from 'crypto'

import {firstOfYearMonth, monthOfYear as monthOf, plusOneMonth, year as yearOf} from './dateTime.js'
import {getPool} from './db.js'
import {
    budget as budgetDto,
    budgetUpdateRequest as budgetUpdateRequestDto,
    instanceUse as instanceUseDto,
    storageUse as storageUseDto,
    userSpendingReport as userSpendingReportDto,
} from './dto.js'

const toDate = value => value ? new Date(value) : null

const createBudgetRepository = (pool = null, clock = () => new Date()) => {
    const resolvePool = () => pool ?? getPool()

    const toStorageUse = row => storageUseDto({
        gbHours: row?.gb_hours ?? 0,
        gb: row?.storage_used ?? 0,
        updateTime: row?.update_time ? new Date(row.update_time) : clock(),
    })

    const toBudget = row => budgetDto({
        instanceSpending: row.monthly_instance,
        storageSpending: row.monthly_storage,
        storageQuota: row.storage_quota,
    })

    const toBudgetUpdateRequest = row => budgetUpdateRequestDto({
        message: row.message,
        instanceSpending: row.requested_monthly_instance,
        storageSpending: row.requested_monthly_storage,
        storageQuota: row.requested_storage_quota,
        creationTime: toDate(row.creation_time),
        updateTime: toDate(row.update_time),
    })

    // Only the rows overlapping [firstOfMonth, endOfMonth) can be charged for that month —
    // instanceSpendingCalculator clamps every use to those bounds anyway, so anything outside
    // contributes 0 hours. `open_session_use` is only ever pruned per removed user, so without
    // this predicate the query would grow with every session the user has ever had.
    // An open row (to_time NULL) always qualifies: its end is resolved to `now` below.
    const userInstanceUses = async (username, year, month) => {
        const p = resolvePool()
        const firstOfMonth = firstOfYearMonth(year, month)
        const endOfMonth = plusOneMonth(firstOfMonth)
        const [rows] = await p.query(
            `SELECT instance_type, from_time, to_time
                FROM open_session_use
                WHERE username = ?
                    AND from_time <= ?
                    AND (to_time IS NULL OR to_time >= ?)`,
            [username, endOfMonth, firstOfMonth]
        )
        const now = clock()
        return rows.map(row => instanceUseDto({
            instanceType: row.instance_type,
            from: new Date(row.from_time),
            to: row.to_time ? new Date(row.to_time) : now,
        }))
    }

    const userStorageUse = async (username, year, month) => {
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT gb_hours, storage_used, update_time
                FROM user_monthly_storage
                WHERE username = ? AND year = ? AND month = ?`,
            [username, year, month]
        )
        return toStorageUse(rows[0])
    }

    const lastUserStorageUse = async username => {
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT gb_hours, storage_used, update_time
                FROM user_monthly_storage
                WHERE username = ?
                ORDER BY year DESC, month DESC
                LIMIT 1`,
            [username]
        )
        return toStorageUse(rows[0])
    }

    const updateUserStorageUse = async (username, storageUse) => {
        const p = resolvePool()
        const updateTime = storageUse.updateTime
        const year = yearOf(updateTime)
        const month = monthOf(updateTime)
        const params = [storageUse.gbHours, storageUse.gb, updateTime, username, year, month]
        const [result] = await p.query(
            `UPDATE user_monthly_storage
                SET gb_hours = ?, storage_used = ?, update_time = ?
                WHERE username = ? AND year = ? AND month = ?`,
            params
        )
        if (!result.affectedRows) {
            await p.query(
                `INSERT INTO user_monthly_storage(gb_hours, storage_used, update_time, username, year, month)
                    VALUES(?, ?, ?, ?, ?, ?)`,
                params
            )
        }
    }

    const userBudget = async username => {
        const p = resolvePool()
        const [userRows] = await p.query(
            `SELECT monthly_instance, monthly_storage, storage_quota
                FROM user_budget
                WHERE username = ?`,
            [username]
        )
        let row = userRows[0]
        if (!row) {
            const [defaultRows] = await p.query(
                `SELECT monthly_instance, monthly_storage, storage_quota
                    FROM default_user_budget`
            )
            row = defaultRows[0]
        }
        return toBudget(row)
    }

    const updateDefaultBudget = async budget => {
        const p = resolvePool()
        const params = [budget.instanceSpending, budget.storageSpending, budget.storageQuota]
        const [result] = await p.query(
            `UPDATE default_user_budget
                SET monthly_instance = ?, monthly_storage = ?, storage_quota = ?`,
            params
        )
        if (!result.affectedRows) {
            await p.query(
                `INSERT INTO default_user_budget(monthly_instance, monthly_storage, storage_quota)
                    VALUES(?, ?, ?)`,
                params
            )
        }
    }

    const updateBudget = async (username, budget) => {
        const p = resolvePool()
        const params = [budget.instanceSpending, budget.storageSpending, budget.storageQuota, username]
        const [result] = await p.query(
            `UPDATE user_budget
                SET monthly_instance = ?, monthly_storage = ?, storage_quota = ?
                WHERE username = ?`,
            params
        )
        if (!result.affectedRows) {
            await p.query(
                `INSERT INTO user_budget(monthly_instance, monthly_storage, storage_quota, username)
                    VALUES(?, ?, ?, ?)`,
                params
            )
        }
        await closeBudgetUpdateRequest(username, budget)
    }

    const saveSpendingReport = async report => {
        const p = resolvePool()
        await p.query('DELETE FROM user_spending')
        const entries = Object.values(report)
        for (const entry of entries) {
            await p.query(
                `INSERT INTO user_spending
                    (username, instance_spending, storage_spending, storage_usage)
                    values (?, ?, ?, ?)`,
                [entry.username, entry.instanceSpending, entry.storageSpending, entry.storageUsage]
            )
        }
    }

    const updateSpendingReport = async (username, report) => {
        const p = resolvePool()
        await p.query(
            `UPDATE user_spending
                SET instance_spending = ?, storage_spending = ?, storage_usage = ?
                WHERE username = ?`,
            [report.instanceSpending, report.storageSpending, report.storageUsage, username]
        )
    }

    const requestBudgetUpdate = async (username, message, requestedBudget) => {
        const p = resolvePool()
        const [result] = await p.query(
            `UPDATE budget_update_request
                SET requested_monthly_instance = ?, requested_monthly_storage = ?, requested_storage_quota = ?, message = ?, update_time = ?
                WHERE username = ? and state = 'PENDING'`,
            [
                requestedBudget.instanceSpending, requestedBudget.storageSpending, requestedBudget.storageQuota,
                message, clock(), username,
            ]
        )
        if (!result.affectedRows) {
            const initialBudget = await userBudget(username)
            await p.query(
                `INSERT INTO budget_update_request(id, initial_monthly_instance, initial_monthly_storage, initial_storage_quota, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, message, creation_time, update_time, state, username)
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(), initialBudget.instanceSpending, initialBudget.storageSpending,
                    initialBudget.storageQuota, requestedBudget.instanceSpending, requestedBudget.storageSpending,
                    requestedBudget.storageQuota, message, clock(), clock(), 'PENDING', username,
                ]
            )
        }
    }

    const closeBudgetUpdateRequest = async (username, finalBudget) => {
        const p = resolvePool()
        await p.query(
            `UPDATE budget_update_request
                SET final_monthly_instance = ?, final_monthly_storage = ?, final_storage_quota = ?, update_time = ?, state = 'CLOSED'
                WHERE username = ? and state = 'PENDING'`,
            [finalBudget.instanceSpending, finalBudget.storageSpending, finalBudget.storageQuota, clock(), username]
        )
    }

    const budgetUpdateRequest = async username => {
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT requested_monthly_instance, requested_monthly_storage, requested_storage_quota, message, creation_time, update_time
                FROM budget_update_request
                WHERE username = ? and state = 'PENDING'`,
            [username]
        )
        // Last PENDING row wins.
        return rows.reduce((_acc, row) => toBudgetUpdateRequest(row), null)
    }

    const budgetUpdateRequests = async () => {
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT username, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, message, creation_time, update_time
                FROM budget_update_request
                WHERE state = 'PENDING'`
        )
        const requests = {}
        for (const row of rows) {
            requests[row.username] = toBudgetUpdateRequest(row)
        }
        return requests
    }

    const spendingReport = async () => {
        const p = resolvePool()
        const requests = await budgetUpdateRequests()
        const report = {}
        const [rows] = await p.query(
            `SELECT u.username, s.instance_spending, s.storage_spending, s.storage_usage,
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
            LEFT JOIN user_budget b ON b.username = u.username`
        )
        for (const row of rows) {
            report[row.username] = userSpendingReportDto({
                username: row.username,
                instanceSpending: row.instance_spending ?? 0,
                storageSpending: row.storage_spending ?? 0,
                storageUsage: row.storage_usage ?? 0,
                instanceBudget: row.monthly_instance ?? 0,
                storageBudget: row.monthly_storage ?? 0,
                storageQuota: row.storage_quota ?? 0,
                costPerGbMonth: 0,
                budgetUpdateRequest: requests[row.username],
            })
        }
        return report
    }

    return {
        budgetUpdateRequest,
        lastUserStorageUse,
        requestBudgetUpdate,
        saveSpendingReport,
        spendingReport,
        updateBudget,
        updateDefaultBudget,
        updateSpendingReport,
        updateUserStorageUse,
        userBudget,
        userInstanceUses,
        userStorageUse,
    }
}

export {createBudgetRepository}
