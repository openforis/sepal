package org.openforis.sepal.component.sandboxmanager.query

import groovy.transform.ToString
import org.openforis.sepal.hostingservice.WorkerInstanceProvider
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@ToString
class FindInstanceTypes implements Query<List<WorkerInstanceType>> {

}

@ToString
class FindInstanceTypesHandler implements QueryHandler<List<WorkerInstanceType>, FindInstanceTypes> {
    private final WorkerInstanceProvider instanceProvider

    FindInstanceTypesHandler(WorkerInstanceProvider instanceProvider) {
        this.instanceProvider = instanceProvider
    }

    List<WorkerInstanceType> execute(FindInstanceTypes query) {
        return instanceProvider.instanceTypes
    }
}

