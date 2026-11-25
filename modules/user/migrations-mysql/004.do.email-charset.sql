-- Emails are not ASCII: the address format accepts any local part, and legacy users registered with
-- accented ones. The collation still ignores case, so the UNIQUE index rejects case-differing duplicates.

ALTER TABLE sepal_user MODIFY `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL;
