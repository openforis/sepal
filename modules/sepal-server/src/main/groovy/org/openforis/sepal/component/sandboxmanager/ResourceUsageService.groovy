package org.openforis.sepal.component.sandboxmanager

import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.util.Clock

import static org.openforis.sepal.util.DateTime.*

class ResourceUsageService {
    private final StorageUsageChecker storageUsageChecker
    private final SessionRepository sessionRepository
    private final StorageUsageRepository storageUsageRepository
    private final Clock clock
    private BigDecimal costPerGbMonth

    ResourceUsageService(
            StorageUsageChecker storageUsageChecker,
            SessionRepository sessionRepository,
            StorageUsageRepository storageUsageRepository,
            Clock clock,
            double costPerGbMonth) {
        this.storageUsageChecker = storageUsageChecker
        this.sessionRepository = sessionRepository
        this.storageUsageRepository = storageUsageRepository
        this.clock = clock
        this.costPerGbMonth = costPerGbMonth
    }

    double monthlyInstanceSpending(String username, List<WorkerInstanceType> instanceTypes) {
        def firstOfMonth = firstOfMonth(clock.now())
        def hoursPerInstanceType = sessionRepository.hoursByInstanceType(username, firstOfMonth)
        return instanceTypes.sum {
            def hours = hoursPerInstanceType[it.id] ?: 0d
            return hours * it.hourlyCost
        } as double
    }

    double storageUsed(String username) {
        def lastMonthlyUsage = storageUsageRepository.lastMonthlyUsage(username)
        return lastMonthlyUsage.storageUsed
    }

    MonthlyUsage updateStorageUsage(String username) {
        def storageUsed = storageUsageChecker.determineUsage(username)
        def lastMonthlyUsage = storageUsageRepository.lastMonthlyUsage(username)
        def monthlyUsage = monthlyUsage(username, lastMonthlyUsage, storageUsed)
        storageUsageRepository.updateMonthlyUsage(monthlyUsage)
        return monthlyUsage
    }

    private MonthlyUsage monthlyUsage(String username, MonthlyUsage lastMonthlyUsage, double storageUsed) {
        def now = clock.now()
        BigDecimal hoursUsed = hoursUsed(lastMonthlyUsage, now)
        def averageUsed = (lastMonthlyUsage.storageUsed + storageUsed) / 2
        def gbHoursIncrement = averageUsed * hoursUsed
        def initialGbHours = sameYearAndMonth(now, lastMonthlyUsage.updateTime) ? lastMonthlyUsage.gbHours : 0
        def gbHours = initialGbHours + gbHoursIncrement
        def monthlyUsage = new MonthlyUsage(username, gbHours, storageUsed, now)
        monthlyUsage
    }

    MonthlyUsage currentMonthlyUsage(String username) {
        def lastMonthlyUsage = storageUsageRepository.lastMonthlyUsage(username)
        return monthlyUsage(username, lastMonthlyUsage, lastMonthlyUsage.storageUsed)
    }

    double monthlyStorageSpending(String username) {
        def lastMonthlyUsage = storageUsageRepository.lastMonthlyUsage(username)
        def hoursSinceCheck = hoursUsed(lastMonthlyUsage, clock.now())
        def gbHours = lastMonthlyUsage.gbHours + hoursSinceCheck * lastMonthlyUsage.storageUsed
        def gbMonths = gbHours / 744
        def spending = gbMonths * costPerGbMonth
        return spending
    }

    private BigDecimal hoursUsed(MonthlyUsage lastMonthlyUsage, Date now) {
        def useStartDate = [firstOfMonth(now), lastMonthlyUsage.updateTime].max()
        return hoursBetween(useStartDate, now)
    }

    static class MonthlyUsage {
        final String username
        final double gbHours
        final double storageUsed
        final Date updateTime

        MonthlyUsage(String username, double gbHours, double storageUsed, Date updateTime) {
            this.username = username
            this.gbHours = gbHours
            this.storageUsed = storageUsed
            this.updateTime = updateTime
        }
    }
}