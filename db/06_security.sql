-- ============================================================
-- ScholarMesh -- 06 -- Least-privilege access for the web application
-- The app logs in as scholarmesh_app (created, with a password taken from
-- the environment, by web/scripts/db-setup.ts). It can read and change
-- data and call functions, but it cannot create, alter or drop anything,
-- and it can only append to the audit log.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scholarmesh_app') THEN
        RAISE NOTICE 'Role scholarmesh_app not found -- grants skipped';
        RETURN;
    END IF;

    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO scholarmesh_app;

    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scholarmesh_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO scholarmesh_app;

    -- audit history is append-only for the application
    REVOKE UPDATE, DELETE, TRUNCATE ON AUDIT_LOG FROM scholarmesh_app;

    GRANT EXECUTE ON ALL FUNCTIONS  IN SCHEMA public TO scholarmesh_app;
    GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO scholarmesh_app;

    -- the SECURITY DEFINER refresh function is callable by the app only
    REVOKE EXECUTE ON FUNCTION fn_refresh_course_stats() FROM PUBLIC;
    GRANT  EXECUTE ON FUNCTION fn_refresh_course_stats() TO scholarmesh_app;
END $$;
