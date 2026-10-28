import {daysInMonth, firstOfMonth, hoursBetween, monthOfYear, sameYearAndMonth, year} from './dateTime.js'
import {storageUse as storageUseDto} from './dto.js'

const maxDate = (a, b) => (a.getTime() >= b.getTime() ? a : b)

const defaultStorageUse = now => storageUseDto({gbHours: 0, gb: 0, updateTime: now})

const determineCurrentStorageUse = (lastStorageUse, gbUsed, now) => {
    const last = lastStorageUse ?? defaultStorageUse(now)
    const useStartDate = maxDate(firstOfMonth(now), last.updateTime)
    const hoursUsed = hoursBetween(useStartDate, now)
    const averageUsed = (last.gb + gbUsed) / 2
    const gbHoursIncrement = averageUsed * hoursUsed
    const initialGbHours = sameYearAndMonth(now, last.updateTime) ? last.gbHours : 0
    const gbHours = initialGbHours + gbHoursIncrement
    return storageUseDto({gbHours, gb: gbUsed, updateTime: now})
}

const updateStorageUseForThisMonth = async (budgetRepository, username, gbUsed, now) => {
    const lastStorageUse = await budgetRepository.lastUserStorageUse(username)
    const storageUseThisMonth = determineCurrentStorageUse(lastStorageUse, gbUsed, now)
    await budgetRepository.updateUserStorageUse(username, storageUseThisMonth)
    return storageUseThisMonth
}

const storageUseForThisMonth = async (budgetRepository, username, now) => {
    const lastStorageUse = await budgetRepository.lastUserStorageUse(username)
    const gbUsed = (lastStorageUse?.gb) || 0
    return determineCurrentStorageUse(lastStorageUse, gbUsed, now)
}

const calculateSpending = (storageUse, costPerGbMonth, now) => {
    const y = year(now)
    const m = monthOfYear(now)
    return storageUse.gbHours * costPerGbMonth / daysInMonth(y, m) / 24
}

export {
    calculateSpending,
    determineCurrentStorageUse,
    storageUseForThisMonth,
    updateStorageUseForThisMonth,
}
