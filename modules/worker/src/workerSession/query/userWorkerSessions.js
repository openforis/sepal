const userWorkerSessions = async ({username, states = [], workerType = null}, {repo}) =>
    repo.userSessions(username, states, workerType)

export {userWorkerSessions}
