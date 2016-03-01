package sandboxmanager

import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.sandboxmanager.BudgetCheck

import static java.time.temporal.ChronoUnit.SECONDS

class BudgetTest extends AbstractSandboxManagerTest {
    def 'When getting sandbox info, storage quota is set'() {
        specifyStorageQuota(123)

        when:
        def info = loadSandboxInfo()

        then:
        info.storageQuota == 123d
    }

    def 'When getting sandbox info, storage budget is set'() {
        specifyStorageBudget(123)

        when:
        def info = loadSandboxInfo()

        then:
        info.monthlyStorageBudget == 123d
    }

    def 'Given storage quota not specified, when loading info, storage quota is default'() {
        when:
        def info = loadSandboxInfo()

        then:
        info.storageQuota == 100d
    }

    def 'Given storage usage checked, when loading info, storage usage is set'() {
        updateStorageUsage(12d)

        when:
        def info = loadSandboxInfo()

        then:
        info.storageUsed == 12d
    }

    def 'Given storage usage checked several times, when loading info, last storage usage is set'() {
        clock.set()
        updateStorageUsage(11d)

        clock.advance(1, SECONDS)
        updateStorageUsage(12d)

        when:
        def info = loadSandboxInfo()

        then:
        info.storageUsed == 12d
    }

    def 'Given 100 GB used 15 days then 250 GB for 16 days, and cost is 0.3 USD per GB-Month, 53.10 USD is spent'() {
        clock.set('2016-03-01')
        updateStorageUsage(100d)
        clock.set('2016-03-15', '23:59:59')
        updateStorageUsage(100d)

        clock.set('2016-03-16')
        updateStorageUsage(250d)
        clock.set('2016-03-31', '23:59:59')

        when:
        def info = loadSandboxInfo()

        then:
        info.monthlyStorageSpending > 50 && info.monthlyStorageSpending < 55
    }

    def 'Given 200 GB measured after 15 days then 250 GB for 16 days, and cost is 0.3 USD per GB-Month, 53.10 USD is spent'() {
        clock.set('2016-03-16', '23:59:59')
        updateStorageUsage(200d)

        clock.set('2016-03-16')
        updateStorageUsage(250d)
        clock.set('2016-03-31', '23:59:59')

        when:
        def info = loadSandboxInfo()

        then:
        info.monthlyStorageSpending > 50 && info.monthlyStorageSpending < 55
    }

    def 'Given 150 GB for several months, 50 GB for 15 days into the month, then 250 GB for 16 days, and cost is 0.3 USD per GB-Month, 53.10 USD is spent'() {
        clock.set('2016-01-01')
        updateStorageUsage(150d)
        clock.set('2016-03-16', '23:59:59')
        updateStorageUsage(50d)
        clock.set('2016-03-16')
        updateStorageUsage(250d)
        clock.set('2016-03-31', '23:59:59')

        when:
        def info = loadSandboxInfo()

        then:
        info.monthlyStorageSpending > 50 && info.monthlyStorageSpending < 55
    }

    def 'Given storage quota is exceeded, when checking budget, sessions are closed'() {
        createSession()
        specifyStorageQuota(1)

        updateStorageUsage(2d)

        when:
        checkBudget()

        then:
        hasNoSessions()
    }

    def 'Given storage quota is exceeded, when creating a session, exception is thrown'() {
        specifyStorageQuota(1)
        updateStorageUsage(2d)

        when:
        createSession()

        then:
        def e = thrown ExecutionFailed
        e.cause instanceof BudgetCheck.StorageQuotaExceeded
    }

    def 'Given storage budget is exceeded, when checking budget, sessions are closed'() {
        clock.set('2016-01-15')
        createSession()
        specifyStorageBudget(1)
        updateStorageUsage(200d)

        when:
        checkBudget()

        then:
        hasNoSessions()
    }

    def 'Given storage budget is exceeded, when creating a session, exception is thrown'() {
        clock.set('2016-01-15')
        createSession()
        specifyStorageBudget(1)
        updateStorageUsage(200d)

        when:
        createSession()

        then:
        def e = thrown ExecutionFailed
        e.cause instanceof BudgetCheck.StorageBudgetExceeded
    }


    def 'Given instance budget exceeded, when checking instance spending, sessions are closed'() {
        clock.set('2016-01-01')
        createSession(expensiveType)
        clock.set('2016-12-31')
        specifyInstanceBudget(1)

        when:
        checkBudget()

        then:
        hasNoSessions()
    }


    def 'Given instance budget exceeded, when creating a session, exception is thrown'() {
        clock.set('2016-01-01')
        createSession(expensiveType)
        clock.set('2016-12-31')
        specifyInstanceBudget(1)

        when:
        createSession()

        then:
        def e = thrown ExecutionFailed
        e.cause instanceof BudgetCheck.InstanceBudgetExceeded
    }

    // TODO: Instance budget - close and don't allow create
}
