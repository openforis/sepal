package org.openforis.sepal.component.budget.internal

import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.budget.api.StorageUse
import org.openforis.sepal.util.Clock

import static org.openforis.sepal.util.DateTime.*

final class StorageUseService {
    private final BudgetRepository budgetRepository
    private final HostingService hostingService
    private final Clock clock

    StorageUseService(BudgetRepository budgetRepository, HostingService hostingService, Clock clock) {
        this.budgetRepository = budgetRepository
        this.hostingService = hostingService
        this.clock = clock
    }

    StorageUse updateStorageUseForThisMonth(String username) {
        def gbUsed = hostingService.gbStorageUsed(username)
        def lastStorageUse = budgetRepository.lastUserStorageUse(username)
        if (gbUsed < 0) gbUsed = lastStorageUse ?: 0
        def storageUseThisMonth = determineCurrentStorageUse(lastStorageUse, gbUsed)
        budgetRepository.updateUserStorageUse(username, storageUseThisMonth)
        return storageUseThisMonth
    }

    StorageUse storageUseForThisMonth(String username) {
        def lastStorageUse = budgetRepository.lastUserStorageUse(username)
        determineCurrentStorageUse(lastStorageUse, lastStorageUse.gb)
    }

    double calculateSpending(StorageUse storageUse) {
        def now = clock.now()
        def year = year(now)
        def month = monthOfYear(now)
        def costPerGbMonth = hostingService.storageCostPerGbMonth()
        storageUse.gbHours * costPerGbMonth / daysInMonth(year, month) / 24
    }

    private StorageUse determineCurrentStorageUse(StorageUse lastStorageUse, double gbUsed) {
        def now = clock.now()
        def hoursUsed = hoursUsed(lastStorageUse, now)
        def averageUsed = (lastStorageUse.gb + gbUsed) / 2
        def gbHoursIncrement = averageUsed * hoursUsed
        def initialGbHours = sameYearAndMonth(now, lastStorageUse.updateTime) ? lastStorageUse.gbHours : 0
        def gbHours = initialGbHours + gbHoursIncrement
        new StorageUse(gbHours: gbHours, gb: gbUsed, updateTime: now)
    }

    private BigDecimal hoursUsed(StorageUse lastMonthlyUsage, Date now) {
        def useStartDate = [firstOfMonth(now), lastMonthlyUsage.updateTime].max()
        return hoursBetween(useStartDate, now)
    }
}
