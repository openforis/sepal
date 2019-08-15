package org.openforis.sepal.taskexecutor.api

import groovy.json.JsonOutput
import groovy.transform.Immutable

@Immutable
class Progress {
    String defaultMessage
    String messageKey
    Map<String, String> messageArgs

    String toJson() {
        JsonOutput.toJson(
            defaultMessage: defaultMessage,
            messageKey: messageKey,
            messageArgs: messageArgs
        )
    }
}
