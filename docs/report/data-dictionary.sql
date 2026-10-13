-- Exports the data dictionary (tables, columns, types, keys, defaults, comments,
-- CHECK constraints) from the PostgreSQL catalog as one JSON document.
--   docker exec -i scholarmesh-db psql -U postgres -d scholarmesh -At < docs/report/data-dictionary.sql > docs/report/data/data-dictionary.json
WITH cols AS (
  SELECT c.table_name, c.column_name, c.ordinal_position,
         CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
              WHEN c.data_type = 'character varying' THEN 'varchar(' || c.character_maximum_length || ')'
              WHEN c.data_type LIKE 'timestamp%' THEN 'timestamptz'
              ELSE c.data_type END
         || CASE WHEN c.udt_name = 'vector' THEN '(384)' ELSE '' END AS type,
         c.is_nullable = 'NO' AS not_null,
         CASE WHEN c.is_generated = 'ALWAYS' THEN 'generated'
              WHEN c.column_default LIKE 'nextval%' THEN 'serial'
              ELSE regexp_replace(coalesce(c.column_default, ''), '::[a-z ]+', '', 'g') END AS default_value,
         col_description(format('%I', c.table_name)::regclass, c.ordinal_position) AS comment
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
), keys AS (
  SELECT kcu.table_name, kcu.column_name,
         string_agg(DISTINCT CASE tc.constraint_type WHEN 'PRIMARY KEY' THEN 'PK'
                                                    WHEN 'FOREIGN KEY' THEN 'FK → ' || upper(ccu.table_name)
                                                    WHEN 'UNIQUE' THEN 'UQ' END, ', ') AS keys
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  LEFT JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
  WHERE tc.table_schema = 'public'
  GROUP BY kcu.table_name, kcu.column_name
), checks AS (
  SELECT conrelid::regclass::text AS table_name,
         jsonb_agg(jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid)) ORDER BY conname) AS checks
  FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace GROUP BY conrelid
)
SELECT json_agg(t ORDER BY t.ord) FROM (
  SELECT upper(c.table_name) AS table_name,
         obj_description(format('%I', c.table_name)::regclass) AS comment,
         ch.checks,
         array_position(ARRAY['student','course','document','tag','study_group','search_log','enrollment',
                              'document_tag','bookmark','group_membership','doc_chunk','audit_log'], c.table_name::text) AS ord,
         json_agg(json_build_object('column', c.column_name, 'type', c.type, 'not_null', c.not_null, 'default', c.default_value,
                                    'keys', k.keys, 'comment', c.comment) ORDER BY c.ordinal_position) AS columns
  FROM cols c
  LEFT JOIN keys k ON k.table_name = c.table_name AND k.column_name = c.column_name
  LEFT JOIN checks ch ON ch.table_name = c.table_name
  GROUP BY c.table_name, ch.checks
) t;
