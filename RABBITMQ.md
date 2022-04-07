# email
    S: email.send                       Q: email.send
    S: user.emailNotificationsEnabled   Q: email.emailNotificationsEnabled

# sys-monitor
    P: email.send                       M: {from, to, subject, content}

# user-files
    P: files.update                     M: {username}
    
# user-storage
    P: userStorage.size                 M: {username, size}
    S: workerSession.#                  Q: userStorage.workerSession
    S: files.#                          Q: userStorage.files

# sepal-storage:budget
    P: budget.?
    S: user.*               Q: budget.user
    S: userStorage.*        Q: budget.userStorage

# sepal-storage:workerInstance
    P: workerInstance.?

# sepal-storage:workerSession
    P: workerSession.?

# user
    P: user.?