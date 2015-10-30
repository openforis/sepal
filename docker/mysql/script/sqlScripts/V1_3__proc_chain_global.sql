ALTER TABLE download_requests ADD group_scenes INT(1) NOT NULL DEFAULT 0;
ALTER TABLE download_requests ADD request_name VARCHAR(255);
ALTER TABLE download_requests ADD request_status VARCHAR(255) NOT NULL DEFAULT 'REQUESTED';
ALTER TABLE download_requests ADD CONSTRAINT uc_user_req_name UNIQUE (username,request_name);