package org.openforis.sepal.component.budget.endpoint

import groovymvc.Controller
import groovymvc.validate.Constraints
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.command.RequestBudgetUpdate
import org.openforis.sepal.component.budget.command.UpdateBudget
import org.openforis.sepal.component.budget.query.LoadSpendingReport
import org.openforis.sepal.endpoint.InvalidRequest

import static groovy.json.JsonOutput.toJson
import static groovymvc.validate.Constraints.notBlank
import static groovymvc.validate.Constraints.notNull
import static org.openforis.sepal.security.Roles.ADMIN

class BudgetEndpoint {
    private final Component component

    BudgetEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {
            get('/budget/report', [ADMIN]) {
                response.contentType = 'application/json'
                def report = component.submit(new LoadSpendingReport())
                def map = reportToMap(report)
                send toJson(map)
            }

            post('/budget', [ADMIN]) {
                response.contentType = 'application/json'
                constrain(UpdateBudget, [
                        username: [notNull(), notBlank()],
                        budget: notNull()
                ])
                constrain(Budget, [
                        instanceSpending: Constraints.min(0),
                        storageSpending: Constraints.min(0),
                        storageQuota: Constraints.min(0)
                ])

                def budget = new Budget(
                        instanceSpending: params.required('instanceSpending', double),
                        storageSpending: params.required('storageSpending', double),
                        storageQuota: params.required('storageQuota', double)
                )

                def command = new UpdateBudget(
                        username: params.required('username', String),
                        budget: budget
                )
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                component.submit(command)
                send toJson(budget)
            }

            post('/budget/requestUpdate') {
                constrain(RequestBudgetUpdate, [
                        message: [notNull(), notBlank()],
                        budget: notNull()
                ])

                def message = params.required('message')
                def budget = new Budget(
                        instanceSpending: params.required('instanceSpending', double),
                        storageSpending: params.required('storageSpending', double),
                        storageQuota: params.required('storageQuota', double)
                )

                def command = new RequestBudgetUpdate(
                        username: currentUser.username,
                        message: message,
                        budget: budget
                )
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                component.submit(command)
                response.status = 204
            }
        }
    }

    Map reportToMap(Map<String, UserSpendingReport> report) {
        report.collectEntries { username, spending ->
            [(username), spendingAsMap(spending)]
        }
    }

    private Map spendingAsMap(UserSpendingReport spending) {
        [
                current: [
                        instanceSpending: spending.instanceSpending,
                        storageSpending: spending.storageSpending,
                        storageQuota: spending.storageUsage],
                budget: [
                        instanceSpending: spending.instanceBudget,
                        storageSpending: spending.storageBudget,
                        storageQuota: spending.storageQuota],
                budgetUpdateRequest: spending.budgetUpdateRequest
        ]
    }

}
