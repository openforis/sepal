package org.openforis.sepal.session

import org.openforis.sepal.instance.Instance
import org.openforis.sepal.session.model.SepalSession

interface SessionContainerProvider {

    SepalSession obtain(String username, Instance instance)

    Boolean isRunning(SepalSession sandboxData)

    Boolean release(SepalSession sandboxData)

}

