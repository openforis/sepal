# email
    S: email.send                       Q: email.send
    S: user.emailNotificationsEnabled   Q: user.emailNotificationsEnabled

# sys-monitor
    P: email.send                       M: {from, to, subject, content}

# user-files
    P: files.update                     M: {username}
    
# user-storage
    P: userStorage.size                 M: {username, size}
    S: workerSession.#                  Q: userStorage.workerSession
    S: files.#                          Q: userStorage.files
