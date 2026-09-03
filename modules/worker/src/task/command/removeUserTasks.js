const removeUserTasks = async (username, {repo}) => {
    await repo.removeNonPendingOrActiveUserTasks(username)
    return null
}

export {removeUserTasks}
