-- ============================================================
-- ScholarMesh -- 09 -- Seed data, part 3: tags on notes, study groups,
-- memberships, bookmarks and search history. Runs after 07 and 08*.
-- All rows are inserted with INSERT ... SELECT look-ups (no hard-coded ids).
-- ============================================================

-- ------------------------------------------------------------ DOCUMENT_TAG
INSERT INTO DOCUMENT_TAG (doc_id, tag_id)
SELECT d.doc_id, t.tag_id
FROM (VALUES
    ('normalization-1nf-bcnf',       ARRAY['normalization', 'functional-dependencies', 'exam-prep']),
    ('acid-isolation-levels',        ARRAY['transactions', 'concurrency', 'exam-prep']),
    ('bplus-tree-hash-indexes',      ARRAY['indexing', 'b-plus-tree', 'query-optimization']),
    ('er-model-mapping',             ARRAY['er-model', 'schema-design']),
    ('sql-joins-cheat-sheet',        ARRAY['sql', 'joins', 'cheat-sheet']),
    ('concurrency-2pl-deadlocks',    ARRAY['concurrency', 'transactions', 'locking']),
    ('requirements-fr-nfr',          ARRAY['requirements', 'software-engineering']),
    ('linear-regression-gd',         ARRAY['regression', 'gradient-descent']),
    ('bias-variance-regularization', ARRAY['regularization', 'overfitting', 'exam-prep']),
    ('decision-trees-random-forests',ARRAY['decision-trees', 'ensemble-learning', 'classification']),
    ('svm-kernel-trick',             ARRAY['svm', 'kernels', 'classification']),
    ('precision-recall-roc',         ARRAY['evaluation-metrics', 'classification']),
    ('kmeans-clustering',            ARRAY['clustering', 'unsupervised-learning']),
    ('eigen-intuition',              ARRAY['eigenvalues', 'linear-algebra']),
    ('svd-pca',                      ARRAY['svd', 'pca', 'linear-algebra', 'unsupervised-learning']),
    ('vector-spaces-rank',           ARRAY['vector-spaces', 'linear-algebra']),
    ('transformers-self-attention',  ARRAY['transformers', 'attention', 'nlp', 'neural-networks']),
    ('word-embeddings',              ARRAY['word-embeddings', 'nlp']),
    ('rnn-lstm-vanishing-gradient',  ARRAY['rnn', 'lstm', 'sequence-models', 'neural-networks']),
    ('cnn-basics',                   ARRAY['cnn', 'computer-vision', 'neural-networks']),
    ('backpropagation',              ARRAY['backpropagation', 'neural-networks', 'gradient-descent']),
    ('dynamic-programming-patterns', ARRAY['dynamic-programming', 'exam-prep']),
    ('graph-traversals',             ARRAY['graphs', 'bfs', 'dfs']),
    ('greedy-exchange-argument',     ARRAY['greedy', 'proofs']),
    ('master-theorem',               ARRAY['recurrences', 'complexity']),
    ('tcp-udp-congestion',           ARRAY['tcp', 'congestion-control', 'networking']),
    ('osi-vs-tcpip',                 ARRAY['networking', 'protocols', 'exam-prep']),
    ('routing-algorithms',           ARRAY['routing', 'networking', 'graphs']),
    ('dns-resolution',               ARRAY['dns', 'networking', 'protocols']),
    ('cpu-scheduling',               ARRAY['scheduling', 'processes', 'exam-prep']),
    ('virtual-memory-paging',        ARRAY['virtual-memory', 'paging']),
    ('deadlocks-bankers',            ARRAY['deadlock', 'resource-allocation', 'concurrency']),
    ('semaphores-producer-consumer', ARRAY['synchronization', 'concurrency', 'processes'])
) AS v(slug, tags)
JOIN DOCUMENT d ON d.file_path = 'seed/' || v.slug || '.md'
CROSS JOIN LATERAL unnest(v.tags) AS tag(name)
JOIN TAG t ON t.tag_name = tag.name;

-- ------------------------------------------------------------ STUDY_GROUP
-- Trigger T6 adds each creator as the group's admin (and T5 checks they are enrolled).
INSERT INTO STUDY_GROUP (group_name, description, max_members, course_id, created_by, created_at)
SELECT v.group_name, v.description, v.max_members, c.course_id, s.student_id, CURRENT_TIMESTAMP - v.age
FROM (VALUES
    ('Normal Form Ninjas'::varchar, 'Weekly DBMS problem sets: decomposition, FDs and past-paper SQL.'::varchar, 6::smallint, 'UE23CS351A'::varchar, 'rahul.verma'::varchar, INTERVAL '30 days'),
    ('Query Optimizers',         'Indexes, query plans and EXPLAIN ANALYZE practice before the lab exam.', 4, 'UE23CS351A', 'karthik.iyer',   INTERVAL '28 days'),
    ('Gradient Descenders',      'Working through ML maths: regression, regularisation and optimisation.',  6, 'UE23CS352A', 'meera.pillai',   INTERVAL '26 days'),
    ('Kernel Trick Club',        'Classification models, SVMs and evaluation metrics — bring questions.',  5, 'UE23CS352A', 'aditya.joshi',   INTERVAL '21 days'),
    ('Attention Is All We Need', 'Reading group for transformers, embeddings and sequence models.',          8, 'UE23CS353A', 'sneha.kulkarni', INTERVAL '20 days'),
    ('Packet Pushers',           'Networks revision: TCP, routing and Wireshark labs.',                      6, 'UE23CS341A', 'arjun.mehta',    INTERVAL '24 days'),
    ('Kernel Panic',             'OS concepts with small C programs: scheduling, paging, semaphores.',       5, 'UE23CS342A', 'rohan.gupta',    INTERVAL '18 days'),
    ('DP on Trees',              'Algorithms practice — one DP or graph problem every evening.',            6, 'UE23CS343A', 'nikhil.bhat',    INTERVAL '22 days')
) AS v(group_name, description, max_members, course_code, creator, age)
JOIN COURSE  c ON c.course_code = v.course_code
JOIN STUDENT s ON s.email = v.creator || '@scholarmesh.test';

-- ------------------------------------------------------------ GROUP_MEMBERSHIP
-- Trigger T5 enforces enrollment + seat limit on every row. 'Query Optimizers' ends up full (4/4).
INSERT INTO GROUP_MEMBERSHIP (group_id, student_id, role, joined_at)
SELECT g.group_id, s.student_id, 'member', g.created_at + v.after
FROM (VALUES
    ('Normal Form Ninjas',       'diya.shah',      INTERVAL '1 day'),
    ('Normal Form Ninjas',       'vikram.reddy',   INTERVAL '2 days'),
    ('Normal Form Ninjas',       'tanvi.hegde',    INTERVAL '4 days'),
    ('Normal Form Ninjas',       'ananya.rao',     INTERVAL '6 days'),
    ('Query Optimizers',         'aditya.joshi',   INTERVAL '1 day'),
    ('Query Optimizers',         'ishita.das',     INTERVAL '3 days'),
    ('Query Optimizers',         'priya.nair',     INTERVAL '5 days'),
    ('Gradient Descenders',      'priya.nair',     INTERVAL '2 days'),
    ('Gradient Descenders',      'ishita.das',     INTERVAL '3 days'),
    ('Kernel Trick Club',        'tanvi.hegde',    INTERVAL '1 day'),
    ('Kernel Trick Club',        'diya.shah',      INTERVAL '2 days'),
    ('Attention Is All We Need', 'kavya.menon',    INTERVAL '1 day'),
    ('Attention Is All We Need', 'siddharth.rao',  INTERVAL '2 days'),
    ('Attention Is All We Need', 'meera.pillai',   INTERVAL '3 days'),
    ('Packet Pushers',           'rahul.verma',    INTERVAL '1 day'),
    ('Packet Pushers',           'nikhil.bhat',    INTERVAL '2 days'),
    ('Packet Pushers',           'tanvi.hegde',    INTERVAL '5 days'),
    ('Kernel Panic',             'vikram.reddy',   INTERVAL '1 day'),
    ('Kernel Panic',             'siddharth.rao',  INTERVAL '3 days'),
    ('DP on Trees',              'ananya.rao',     INTERVAL '1 day'),
    ('DP on Trees',              'rohan.gupta',    INTERVAL '2 days'),
    ('DP on Trees',              'meera.pillai',   INTERVAL '4 days')
) AS v(group_name, handle, after)
JOIN STUDY_GROUP g ON g.group_name = v.group_name
JOIN STUDENT s     ON s.email = v.handle || '@scholarmesh.test';

-- ------------------------------------------------------------ BOOKMARK
-- Only documents the student is allowed to see (checked with fn_can_view_document).
INSERT INTO BOOKMARK (student_id, doc_id, bookmarked_at)
SELECT s.student_id, d.doc_id, CURRENT_TIMESTAMP - v.age
FROM (VALUES
    ('ananya.rao',     'transformers-self-attention',  INTERVAL '20 days'), ('ananya.rao',     'bias-variance-regularization', INTERVAL '18 days'),
    ('ananya.rao',     'acid-isolation-levels',        INTERVAL '15 days'), ('ananya.rao',     'word-embeddings',              INTERVAL '12 days'),
    ('ananya.rao',     'graph-traversals',             INTERVAL '9 days'),  ('ananya.rao',     'decision-trees-random-forests',INTERVAL '3 days'),
    ('rahul.verma',    'normalization-1nf-bcnf',       INTERVAL '25 days'), ('rahul.verma',    'bplus-tree-hash-indexes',      INTERVAL '21 days'),
    ('rahul.verma',    'dns-resolution',               INTERVAL '6 days'),  ('rahul.verma',    'cpu-scheduling',               INTERVAL '14 days'),
    ('rahul.verma',    'dynamic-programming-patterns', INTERVAL '10 days'),
    ('priya.nair',     'transformers-self-attention',  INTERVAL '19 days'), ('priya.nair',     'bias-variance-regularization', INTERVAL '16 days'),
    ('priya.nair',     'precision-recall-roc',         INTERVAL '11 days'), ('priya.nair',     'svd-pca',                      INTERVAL '8 days'),
    ('priya.nair',     'backpropagation',              INTERVAL '2 days'),
    ('karthik.iyer',   'acid-isolation-levels',        INTERVAL '22 days'), ('karthik.iyer',   'tcp-udp-congestion',           INTERVAL '17 days'),
    ('karthik.iyer',   'virtual-memory-paging',        INTERVAL '9 days'),
    ('sneha.kulkarni', 'word-embeddings',              INTERVAL '23 days'), ('sneha.kulkarni', 'linear-regression-gd',         INTERVAL '20 days'),
    ('sneha.kulkarni', 'eigen-intuition',              INTERVAL '13 days'), ('sneha.kulkarni', 'backpropagation',              INTERVAL '1 day'),
    ('arjun.mehta',    'tcp-udp-congestion',           INTERVAL '24 days'), ('arjun.mehta',    'cpu-scheduling',               INTERVAL '19 days'),
    ('arjun.mehta',    'svd-pca',                      INTERVAL '7 days'),
    ('diya.shah',      'normalization-1nf-bcnf',       INTERVAL '26 days'), ('diya.shah',      'sql-joins-cheat-sheet',        INTERVAL '10 days'),
    ('diya.shah',      'dynamic-programming-patterns', INTERVAL '15 days'), ('diya.shah',      'decision-trees-random-forests',INTERVAL '5 days'),
    ('rohan.gupta',    'cpu-scheduling',               INTERVAL '21 days'), ('rohan.gupta',    'graph-traversals',             INTERVAL '12 days'),
    ('rohan.gupta',    'rnn-lstm-vanishing-gradient',  INTERVAL '8 days'),
    ('meera.pillai',   'transformers-self-attention',  INTERVAL '17 days'), ('meera.pillai',   'rnn-lstm-vanishing-gradient',  INTERVAL '11 days'),
    ('meera.pillai',   'linear-regression-gd',         INTERVAL '27 days'), ('meera.pillai',   'dynamic-programming-patterns', INTERVAL '6 days'),
    ('vikram.reddy',   'normalization-1nf-bcnf',       INTERVAL '23 days'), ('vikram.reddy',   'bplus-tree-hash-indexes',      INTERVAL '18 days'),
    ('vikram.reddy',   'virtual-memory-paging',        INTERVAL '12 days'), ('vikram.reddy',   'osi-vs-tcpip',                 INTERVAL '4 days'),
    ('ishita.das',     'linear-regression-gd',         INTERVAL '22 days'), ('ishita.das',     'bias-variance-regularization', INTERVAL '19 days'),
    ('ishita.das',     'sql-joins-cheat-sheet',        INTERVAL '7 days'),  ('ishita.das',     'transformers-self-attention',  INTERVAL '3 days'),
    ('aditya.joshi',   'acid-isolation-levels',        INTERVAL '20 days'), ('aditya.joshi',   'virtual-memory-paging',        INTERVAL '13 days'),
    ('aditya.joshi',   'dynamic-programming-patterns', INTERVAL '9 days'),  ('aditya.joshi',   'decision-trees-random-forests',INTERVAL '2 days'),
    ('nikhil.bhat',    'tcp-udp-congestion',           INTERVAL '16 days'), ('nikhil.bhat',    'dynamic-programming-patterns', INTERVAL '11 days'),
    ('nikhil.bhat',    'eigen-intuition',              INTERVAL '5 days'),
    ('kavya.menon',    'transformers-self-attention',  INTERVAL '14 days'), ('kavya.menon',    'eigen-intuition',              INTERVAL '9 days'),
    ('kavya.menon',    'bias-variance-regularization', INTERVAL '4 days'),
    ('siddharth.rao',  'transformers-self-attention',  INTERVAL '12 days'), ('siddharth.rao',  'word-embeddings',              INTERVAL '10 days'),
    ('siddharth.rao',  'graph-traversals',             INTERVAL '6 days'),
    ('tanvi.hegde',    'normalization-1nf-bcnf',       INTERVAL '8 days'),  ('tanvi.hegde',    'concurrency-2pl-deadlocks',    INTERVAL '5 days'),
    ('tanvi.hegde',    'precision-recall-roc',         INTERVAL '2 days')
) AS v(handle, slug, age)
JOIN STUDENT s  ON s.email = v.handle || '@scholarmesh.test'
JOIN DOCUMENT d ON d.file_path = 'seed/' || v.slug || '.md'
WHERE fn_can_view_document(s.student_id, d.doc_id);

-- ------------------------------------------------------------ SEARCH_LOG
-- query_embedding is filled later by the embedding worker (npm run db:embed).
INSERT INTO SEARCH_LOG (query_text, student_id, search_mode, result_count, searched_at)
SELECT v.query_text, s.student_id, v.mode, v.result_count, CURRENT_TIMESTAMP - v.age
FROM (VALUES
    ('how does attention work in transformers'::varchar, 'ananya.rao'::varchar,    'hybrid'::varchar,   6, INTERVAL '29 days 3 hours'),
    ('difference between 3nf and bcnf',                 'ananya.rao',              'keyword',  3, INTERVAL '27 days 5 hours'),
    ('why do gradients vanish in deep networks',        'ananya.rao',              'semantic', 5, INTERVAL '12 days 2 hours'),
    ('kernel trick intuition',                          'ananya.rao',              'hybrid',   4, INTERVAL '6 days 1 hour'),
    ('how do models focus on the important words',      'ananya.rao',              'semantic', 5, INTERVAL '2 days 4 hours'),
    ('difference between 3nf and bcnf',                 'rahul.verma',             'hybrid',   4, INTERVAL '28 days 1 hour'),
    ('tcp congestion window',                           'rahul.verma',             'keyword',  2, INTERVAL '22 days 6 hours'),
    ('isolation levels phantom read',                   'rahul.verma',             'hybrid',   3, INTERVAL '15 days 3 hours'),
    ('round robin time quantum',                        'rahul.verma',             'keyword',  2, INTERVAL '4 days 7 hours'),
    ('regularization to stop overfitting',              'priya.nair',              'semantic', 5, INTERVAL '26 days 2 hours'),
    ('how does attention work in transformers',         'priya.nair',              'hybrid',   6, INTERVAL '19 days 8 hours'),
    ('pca vs svd',                                      'priya.nair',              'keyword',  2, INTERVAL '10 days 1 hour'),
    ('roc curve auc meaning',                           'priya.nair',              'hybrid',   3, INTERVAL '3 days 2 hours'),
    ('b+ tree vs hash index',                           'karthik.iyer',            'keyword',  2, INTERVAL '25 days 4 hours'),
    ('what happens when i type a url',                  'karthik.iyer',            'semantic', 4, INTERVAL '13 days 5 hours'),
    ('uml sequence diagrams',                           'karthik.iyer',            'hybrid',   0, INTERVAL '8 days 3 hours'),
    ('agile sprint planning',                           'karthik.iyer',            'keyword',  0, INTERVAL '1 day 6 hours'),
    ('word2vec skip gram',                              'sneha.kulkarni',          'keyword',  2, INTERVAL '24 days 1 hour'),
    ('how does attention work in transformers',         'sneha.kulkarni',          'hybrid',   6, INTERVAL '17 days 3 hours'),
    ('software testing techniques',                     'sneha.kulkarni',          'hybrid',   0, INTERVAL '9 days 2 hours'),
    ('eigenvectors intuition',                          'sneha.kulkarni',          'semantic', 3, INTERVAL '5 days 4 hours'),
    ('tcp congestion window',                           'arjun.mehta',             'hybrid',   3, INTERVAL '23 days 2 hours'),
    ('osi layers explained',                            'arjun.mehta',             'keyword',  2, INTERVAL '18 days 5 hours'),
    ('bankers algorithm safe state',                    'arjun.mehta',             'hybrid',   2, INTERVAL '7 days 1 hour'),
    ('sql left join vs inner join',                     'diya.shah',               'keyword',  2, INTERVAL '21 days 3 hours'),
    ('difference between 3nf and bcnf',                 'diya.shah',               'hybrid',   4, INTERVAL '16 days 2 hours'),
    ('greedy vs dynamic programming',                   'diya.shah',               'semantic', 4, INTERVAL '6 days 5 hours'),
    ('uml sequence diagrams',                           'diya.shah',               'semantic', 0, INTERVAL '2 days 1 hour'),
    ('page replacement lru fifo',                       'rohan.gupta',             'keyword',  2, INTERVAL '20 days 6 hours'),
    ('convolution padding stride',                      'rohan.gupta',             'hybrid',   2, INTERVAL '11 days 3 hours'),
    ('topological sort',                                'rohan.gupta',             'keyword',  1, INTERVAL '3 days 2 hours'),
    ('why do gradients vanish in deep networks',        'meera.pillai',            'semantic', 5, INTERVAL '25 days 4 hours'),
    ('regularization to stop overfitting',              'meera.pillai',            'hybrid',   5, INTERVAL '14 days 1 hour'),
    ('memoization vs tabulation',                       'meera.pillai',            'keyword',  1, INTERVAL '4 days 3 hours'),
    ('isolation levels phantom read',                   'vikram.reddy',            'hybrid',   3, INTERVAL '19 days 2 hours'),
    ('cpu scheduling starvation',                       'vikram.reddy',            'semantic', 3, INTERVAL '9 days 4 hours'),
    ('agile sprint planning',                           'vikram.reddy',            'hybrid',   0, INTERVAL '5 days 6 hours'),
    ('random forest vs decision tree',                  'ishita.das',              'keyword',  2, INTERVAL '22 days 1 hour'),
    ('how does attention work in transformers',         'ishita.das',              'hybrid',   6, INTERVAL '8 days 2 hours'),
    ('precision vs recall',                             'aditya.joshi',            'keyword',  2, INTERVAL '17 days 5 hours'),
    ('producer consumer semaphore',                     'aditya.joshi',            'hybrid',   2, INTERVAL '10 days 3 hours'),
    ('quantum computing basics',                        'aditya.joshi',            'semantic', 0, INTERVAL '1 day 2 hours'),
    ('dijkstra link state routing',                     'nikhil.bhat',             'keyword',  2, INTERVAL '15 days 4 hours'),
    ('tcp congestion window',                           'nikhil.bhat',             'hybrid',   3, INTERVAL '7 days 2 hours'),
    ('k means choose k',                                'kavya.menon',             'semantic', 2, INTERVAL '13 days 1 hour'),
    ('software testing techniques',                     'kavya.menon',             'keyword',  0, INTERVAL '3 days 5 hours'),
    ('lstm gates explained',                            'siddharth.rao',           'hybrid',   3, INTERVAL '12 days 6 hours'),
    ('master theorem cases',                            'siddharth.rao',           'keyword',  1, INTERVAL '2 days 3 hours'),
    ('two phase locking deadlock',                      'tanvi.hegde',             'hybrid',   3, INTERVAL '11 days 2 hours'),
    ('difference between 3nf and bcnf',                 'tanvi.hegde',             'keyword',  3, INTERVAL '6 days 4 hours'),
    ('quantum computing basics',                        'tanvi.hegde',             'hybrid',   0, INTERVAL '4 hours')
) AS v(query_text, handle, mode, result_count, age)
JOIN STUDENT s ON s.email = v.handle || '@scholarmesh.test';

-- ------------------------------------------------------------ finish
UPDATE DOCUMENT SET updated_at = upload_date;   -- seed notes have never been edited
SELECT fn_refresh_course_stats();
TRUNCATE AUDIT_LOG RESTART IDENTITY;      -- start the demo with an empty change history

SELECT 'student' AS table_name, COUNT(*) AS row_count FROM STUDENT
UNION ALL SELECT 'course', COUNT(*) FROM COURSE
UNION ALL SELECT 'enrollment', COUNT(*) FROM ENROLLMENT
UNION ALL SELECT 'document', COUNT(*) FROM DOCUMENT
UNION ALL SELECT 'doc_chunk', COUNT(*) FROM DOC_CHUNK
UNION ALL SELECT 'tag', COUNT(*) FROM TAG
UNION ALL SELECT 'document_tag', COUNT(*) FROM DOCUMENT_TAG
UNION ALL SELECT 'study_group', COUNT(*) FROM STUDY_GROUP
UNION ALL SELECT 'group_membership', COUNT(*) FROM GROUP_MEMBERSHIP
UNION ALL SELECT 'bookmark', COUNT(*) FROM BOOKMARK
UNION ALL SELECT 'search_log', COUNT(*) FROM SEARCH_LOG;
