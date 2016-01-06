package org.openforis.sepal.session.model

import org.openforis.sepal.instance.InstanceType
import org.openforis.sepal.user.User


class UserSessions {

    User user
    MonthlySessionStatusReport monthlyCostsReport
    SepalSession[] activeSessions
    InstanceType[] availableInstanceTypes
}
