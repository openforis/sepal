// Convert a task failure error into the statusDescription stored for the task and rendered by the GUI via
// msg(messageKey, messageArgs, defaultMessage). Structured SEPAL exceptions carry a user-facing userMessage
// {key, message, args}; use it directly so the GUI shows a localized, prefix-free message:
//   - domain errors (e.g. ClientException) -> their specific message;
//   - EE errors (EEException) -> the Earth Engine message;
//   - any other plain Error, once wrapped by toException at the worker boundary -> ServerException's generic
//     {key: 'error.internal', message: 'Internal error'}.
// Errors that somehow arrive WITHOUT a userMessage (not wrapped by toException) get a generic task-failure
// descriptor. Either way the task status never surfaces raw String(error)/"ServerException: ..." text; full
// detail (stack, cause, specific message) is logged separately by the caller via errorReport(error).
export const taskFailureStatus = error =>
    error?.userMessage
        ? {
            messageKey: error.userMessage.key,
            defaultMessage: error.userMessage.message,
            messageArgs: error.userMessage.args
        }
        : {
            messageKey: 'tasks.status.failedGeneric',
            defaultMessage: 'The task failed. Check the logs for details.'
        }
