package org.openforis.sepal.util

import org.openforis.sepal.instance.Instance
import org.openforis.sepal.session.model.SepalSession

import static org.openforis.sepal.util.DateTime.getDifferenceInSeconds

class SandboxUtils {


    public static void calculateCosts(Instance instance) {
        instance?.durationInSecs = getDifferenceInSeconds(instance?.terminationTime ?: new Date(), instance?.launchTime)
        def instanceUptimeHours = Math.ceil((instance?.durationInSecs / 60) / 60)
        instance?.costs = instanceUptimeHours * instance?.instanceType?.hourlyCosts
    }

    public static void calculateCosts(SepalSession session) {
        session?.durationInSecs = getDifferenceInSeconds(session?.terminatedOn ?: new Date(), session?.createdOn)
        def sessionUptimeHours = Math.ceil((session?.durationInSecs / 60) / 60)
        session?.costs = sessionUptimeHours * session?.instance?.instanceType?.hourlyCosts
        calculateCosts(session?.instance)
    }
}
