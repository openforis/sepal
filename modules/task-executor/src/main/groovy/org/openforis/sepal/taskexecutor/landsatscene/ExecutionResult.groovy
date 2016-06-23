package org.openforis.sepal.taskexecutor.landsatscene

import groovy.transform.ToString

@ToString(includeSuperProperties = true, includePackage = false, includeNames = true)
final class ExecutionResult {
    final boolean success
    final String message

    boolean isFailure() {
        return !success
    }

    private ExecutionResult(boolean success, String message) {
        this.success = success
        this.message = message
    }

    static ExecutionResult success(String message) {
        return new ExecutionResult(true, message)
    }

    static ExecutionResult failure(String message) {
        return new ExecutionResult(false, message)
    }
}
