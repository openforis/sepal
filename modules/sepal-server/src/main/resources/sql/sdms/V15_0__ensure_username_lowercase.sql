
UPDATE worker_session
    SET username = LOWER(username)
    WHERE username != LOWER(username);
