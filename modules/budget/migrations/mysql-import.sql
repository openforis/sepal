INSERT INTO user_budget (username, monthly_instance, monthly_storage, storage_quota)
SELECT username, monthly_instance, monthly_storage, storage_quota FROM mysql_source.user_budget;

INSERT INTO default_user_budget (monthly_instance, monthly_storage, storage_quota)
SELECT monthly_instance, monthly_storage, storage_quota FROM mysql_source.default_user_budget;

INSERT INTO user_monthly_storage (username, year, month, gb_hours, storage_used, update_time)
SELECT username, year, month, gb_hours, storage_used, update_time FROM mysql_source.user_monthly_storage;

INSERT INTO user_spending (username, instance_spending, storage_spending, storage_usage)
SELECT username, instance_spending, storage_spending, storage_usage FROM mysql_source.user_spending;

INSERT INTO budget_update_request (id, username, state, message, initial_monthly_instance, initial_monthly_storage,
    initial_storage_quota, requested_monthly_instance, requested_monthly_storage, requested_storage_quota,
    final_monthly_instance, final_monthly_storage, final_storage_quota, creation_time, update_time)
SELECT id, username, state, message, initial_monthly_instance, initial_monthly_storage,
    initial_storage_quota, requested_monthly_instance, requested_monthly_storage, requested_storage_quota,
    final_monthly_instance, final_monthly_storage, final_storage_quota, creation_time, update_time
FROM mysql_source.budget_update_request;

INSERT INTO open_session_use (session_id, username, instance_type, from_time, to_time)
SELECT session_id, username, instance_type, from_time, to_time FROM mysql_source.open_session_use;
