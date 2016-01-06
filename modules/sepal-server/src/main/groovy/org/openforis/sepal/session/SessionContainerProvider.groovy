package org.openforis.sepal.session

import org.openforis.sepal.instance.Instance
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.user.User

interface SessionContainerProvider {

    SepalSession obtain(User user, Instance instance)

    Boolean isRunning(SepalSession sandboxData)

    Boolean release(SepalSession sandboxData)

}

