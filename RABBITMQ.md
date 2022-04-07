# user-files
    P: files.update         M: {username}
    
# user-storage
    P: userStorage.size     M: {username, size}
    S: workerSession.#      Q: userStorage.workerSession
    S: files.#              Q: userStorage.files
