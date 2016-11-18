package org.openforis.sepal.component.budget.query

import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.internal.InstanceSpendingService
import org.openforis.sepal.component.budget.internal.StorageUseService
import org.openforis.sepal.component.workersession.api.UserSessionReport
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.user.UserRepository

class GenerateSpendingReport implements Query<Map<String, UserSpendingReport>> {
}

class GenerateSpendingReportHandler implements QueryHandler<Map<String, UserSpendingReport>, GenerateSpendingReport> {
    private final GenerateUserSpendingReportHandler userSpendingReportGenerator
    private final UserRepository userRepository

    GenerateSpendingReportHandler(
            InstanceSpendingService instanceSpendingService,
            StorageUseService storageUseService,
            BudgetRepository budgetRepository,
            UserRepository userRepository) {
        userSpendingReportGenerator = new GenerateUserSpendingReportHandler(
                instanceSpendingService,
                storageUseService,
                budgetRepository)
        this.userRepository = userRepository
    }

    Map<String, UserSessionReport> execute(GenerateSpendingReport query) {
        def reports = [:]
        userRepository.eachUsername { username ->
            def report = userSpendingReportGenerator.execute(new GenerateUserSpendingReport(username: username))
            reports[username] = report
        }
        return reports
    }
}
