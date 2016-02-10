package org.openforis.sepal.component.sandboxmanager.query

import groovy.transform.ToString
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@ToString
class FindInstanceTypes implements Query<List<WorkerInstanceType>> {

}

@ToString
class FindInstanceTypesHandler implements QueryHandler<List<WorkerInstanceType>, FindInstanceTypes> {
    private final WorkerInstanceManager instanceProvider

    FindInstanceTypesHandler(WorkerInstanceManager instanceProvider) {
        this.instanceProvider = instanceProvider
    }

    List<WorkerInstanceType> execute(FindInstanceTypes query) {
        return instanceProvider.instanceTypes
    }
}

