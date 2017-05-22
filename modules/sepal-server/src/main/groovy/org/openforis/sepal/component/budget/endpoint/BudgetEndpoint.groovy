package org.openforis.sepal.component.budget.endpoint

import groovymvc.Controller
import groovymvc.validate.Constraints
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.command.UpdateBudget
import org.openforis.sepal.component.budget.query.GenerateSpendingReport
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
                def report = component.submit(new GenerateSpendingReport())
                def map = reportToMap(report)
                send toJson(map)
            }

            post('/budget', [ADMIN]) {
                response.contentType = 'application/json'
                constrain(UpdateBudget, [
                        username: [notNull(), notBlank()],
                        budget  : notNull()
                ])
                constrain(Budget, [
                        instanceSpending: Constraints.min(0),
                        storageSpending : Constraints.min(0),
                        storageQuota    : Constraints.min(0)
                ])

                def command = new UpdateBudget(
                        username: params.required('username', String),
                        budget: new Budget(
                                instanceSpending: params.required('monthlyInstanceBudget', double),
                                storageSpending: params.required('monthlyStorageBudget', double),
                                storageQuota: params.required('storageQuota', double)
                        )
                )
                def errors = bindAndValidate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                component.submit(command)
                if (currentUser.username == command.username) // Current user updated
                    response.addHeader('sepal-user-updated', 'true')
                send toJson(status: 'success', message: 'Budget updated')
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
                monthlyInstanceBudget  : spending.instanceBudget,
                monthlyInstanceSpending: spending.instanceSpending.round(2),
                monthlyStorageBudget   : spending.storageBudget,
                monthlyStorageSpending : spending.storageSpending.round(2),
                storageQuota           : spending.storageQuota,
                storageUsed            : spending.storageUsage.round(2)
        ]
    }

}
