INSERT INTO worker_session (id, state, username, worker_type, instance_type, instance_id, instance_name, host,
                            creation_time, update_time, timeout_time, last_interaction_time, active_time,
                            notification_state, notified_time, api_key)
SELECT id, state, username, worker_type, instance_type, instance_id, instance_name, host,
       creation_time, update_time, timeout_time, last_interaction_time, active_time,
       notification_state, notified_time, api_key
FROM mysql_source.worker_session;

INSERT INTO instance_claim (instance_id, session_id, claimed_at)
SELECT instance_id, session_id, claimed_at
FROM mysql_source.instance_claim;

INSERT INTO session_app (username, app_path, session_id, label, client_id, creation_time)
SELECT username, app_path, session_id, label, client_id, creation_time
FROM mysql_source.session_app;

INSERT INTO instance_usage_sample (session_id, username, instance_type, sample_time, cpu_pct, ram_bytes, ram_pct,
                                   gpu_pct, gpu_ram_bytes, net_rx_bytes_per_s, net_tx_bytes_per_s)
SELECT session_id, username, instance_type, sample_time, cpu_pct, ram_bytes, ram_pct,
       gpu_pct, gpu_ram_bytes, net_rx_bytes_per_s, net_tx_bytes_per_s
FROM mysql_source.instance_usage_sample;

INSERT INTO instance_usage_hourly (session_id, username, instance_type, hour, sample_count, cpu_avg, cpu_max,
                                   ram_avg, ram_max, gpu_avg, gpu_max, gpu_ram_max, net_avg_bytes_per_s)
SELECT session_id, username, instance_type, hour, sample_count, cpu_avg, cpu_max,
       ram_avg, ram_max, gpu_avg, gpu_max, gpu_ram_max, net_avg_bytes_per_s
FROM mysql_source.instance_usage_hourly;
