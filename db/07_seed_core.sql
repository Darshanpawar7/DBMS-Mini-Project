-- ============================================================
-- ScholarMesh -- 07 -- Seed data, part 1: courses, users, enrollments, tags
-- Demo logins (bcrypt hashes below -- no plain-text password is stored):
--   admin@scholarmesh.test        / Admin@12345   (role admin)
--   <first>.<last>@scholarmesh.test / Scholar@123 (role student)
-- ============================================================
TRUNCATE STUDENT, COURSE, TAG RESTART IDENTITY CASCADE;   -- cascades to every dependent table
SELECT set_config('app.current_user_id', '', false);

-- ------------------------------------------------------------ COURSE
INSERT INTO COURSE (course_code, course_title, department) VALUES
    ('UE23CS351A', 'Database Management Systems',          'Computer Science'),
    ('UE23CS352A', 'Machine Learning',                     'Computer Science'),
    ('UE23CS353A', 'Deep Learning and NLP',                'Computer Science'),
    ('UE23CS341A', 'Computer Networks',                    'Computer Science'),
    ('UE23CS342A', 'Operating Systems',                    'Computer Science'),
    ('UE23CS343A', 'Design and Analysis of Algorithms',    'Computer Science'),
    ('UE23MA241B', 'Linear Algebra and Its Applications',  'Mathematics'),
    ('UE23CS344A', 'Software Engineering',                 'Computer Science');

-- ------------------------------------------------------------ STUDENT
INSERT INTO STUDENT (full_name, email, password_hash, program, year_of_study, role, created_at)
SELECT v.full_name, v.email, v.password_hash, v.program, v.year_of_study, v.role, CURRENT_TIMESTAMP - v.age
FROM (VALUES
    ('Platform Admin'::varchar, 'admin@scholarmesh.test'::varchar,
     '$2b$10$NLNHSrtE0tFq0PvOsHURTezWDAQT2X7LrJcdqmGqcJ6P4Yl4pcyR6'::varchar, 'Faculty'::varchar, NULL::smallint, 'admin'::varchar, INTERVAL '70 days'),
    ('Darshan P Pawar',      'darshan.pawar@scholarmesh.test',      '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           3, 'student', INTERVAL '60 days'),
    ('Dhanush V Biradar',     'dhanush.biradar@scholarmesh.test',     '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           3, 'student', INTERVAL '58 days'),
    ('Priya Nair',      'priya.nair@scholarmesh.test',      '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE (AI & ML)', 3, 'student', INTERVAL '57 days'),
    ('Karthik Iyer',    'karthik.iyer@scholarmesh.test',    '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           3, 'student', INTERVAL '55 days'),
    ('Sneha Kulkarni',  'sneha.kulkarni@scholarmesh.test',  '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE (AI & ML)', 3, 'student', INTERVAL '54 days'),
    ('Arjun Mehta',     'arjun.mehta@scholarmesh.test',     '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech ECE',           3, 'student', INTERVAL '52 days'),
    ('Diya Shah',       'diya.shah@scholarmesh.test',       '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           2, 'student', INTERVAL '50 days'),
    ('Rohan Gupta',     'rohan.gupta@scholarmesh.test',     '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           3, 'student', INTERVAL '49 days'),
    ('Meera Pillai',    'meera.pillai@scholarmesh.test',    '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE (AI & ML)', 4, 'student', INTERVAL '48 days'),
    ('Vikram Reddy',    'vikram.reddy@scholarmesh.test',    '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           3, 'student', INTERVAL '46 days'),
    ('Ishita Das',      'ishita.das@scholarmesh.test',      '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           3, 'student', INTERVAL '45 days'),
    ('Aditya Joshi',    'aditya.joshi@scholarmesh.test',    '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           3, 'student', INTERVAL '44 days'),
    ('Nikhil Bhat',     'nikhil.bhat@scholarmesh.test',     '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech ECE',           2, 'student', INTERVAL '43 days'),
    ('Kavya Menon',     'kavya.menon@scholarmesh.test',     '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE (AI & ML)', 3, 'student', INTERVAL '42 days'),
    ('Siddharth Rao',   'siddharth.rao@scholarmesh.test',   '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           4, 'student', INTERVAL '41 days'),
    ('Tanvi Hegde',     'tanvi.hegde@scholarmesh.test',     '$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK', 'B.Tech CSE',           3, 'student', INTERVAL '40 days')
) AS v(full_name, email, password_hash, program, year_of_study, role, age);

-- ------------------------------------------------------------ ENROLLMENT (INSERT ... SELECT with look-ups)
INSERT INTO ENROLLMENT (student_id, course_id, semester)
SELECT s.student_id, c.course_id, v.semester
FROM (VALUES
    ('darshan.pawar',     'UE23CS351A', '2026-ODD'), ('darshan.pawar',     'UE23CS352A', '2026-ODD'),
    ('darshan.pawar',     'UE23CS353A', '2026-ODD'), ('darshan.pawar',     'UE23CS343A', '2026-ODD'),
    ('dhanush.biradar',    'UE23CS351A', '2026-ODD'), ('dhanush.biradar',    'UE23CS341A', '2026-ODD'),
    ('dhanush.biradar',    'UE23CS342A', '2026-ODD'), ('dhanush.biradar',    'UE23CS343A', '2026-ODD'),
    ('priya.nair',     'UE23CS352A', '2026-ODD'), ('priya.nair',     'UE23CS353A', '2026-ODD'),
    ('priya.nair',     'UE23MA241B', '2026-ODD'), ('priya.nair',     'UE23CS351A', '2026-ODD'),
    ('karthik.iyer',   'UE23CS341A', '2026-ODD'), ('karthik.iyer',   'UE23CS342A', '2026-ODD'),
    ('karthik.iyer',   'UE23CS351A', '2026-ODD'), ('karthik.iyer',   'UE23CS344A', '2026-ODD'),
    ('sneha.kulkarni', 'UE23CS352A', '2026-ODD'), ('sneha.kulkarni', 'UE23CS353A', '2026-ODD'),
    ('sneha.kulkarni', 'UE23MA241B', '2026-ODD'), ('sneha.kulkarni', 'UE23CS344A', '2026-ODD'),
    ('arjun.mehta',    'UE23CS341A', '2026-ODD'), ('arjun.mehta',    'UE23CS342A', '2026-ODD'),
    ('arjun.mehta',    'UE23MA241B', '2026-ODD'),
    ('diya.shah',      'UE23CS351A', '2026-ODD'), ('diya.shah',      'UE23CS343A', '2026-ODD'),
    ('diya.shah',      'UE23CS344A', '2026-ODD'), ('diya.shah',      'UE23CS352A', '2026-ODD'),
    ('rohan.gupta',    'UE23CS342A', '2026-ODD'), ('rohan.gupta',    'UE23CS343A', '2026-ODD'),
    ('rohan.gupta',    'UE23CS341A', '2026-ODD'), ('rohan.gupta',    'UE23CS353A', '2026-ODD'),
    ('meera.pillai',   'UE23CS352A', '2026-ODD'), ('meera.pillai',   'UE23CS353A', '2026-ODD'),
    ('meera.pillai',   'UE23MA241B', '2026-ODD'), ('meera.pillai',   'UE23CS343A', '2026-ODD'),
    ('vikram.reddy',   'UE23CS351A', '2026-ODD'), ('vikram.reddy',   'UE23CS342A', '2026-ODD'),
    ('vikram.reddy',   'UE23CS341A', '2026-ODD'), ('vikram.reddy',   'UE23CS344A', '2026-ODD'),
    ('ishita.das',     'UE23CS352A', '2026-ODD'), ('ishita.das',     'UE23CS353A', '2026-ODD'),
    ('ishita.das',     'UE23CS351A', '2026-ODD'),
    ('aditya.joshi',   'UE23CS343A', '2026-ODD'), ('aditya.joshi',   'UE23CS351A', '2026-ODD'),
    ('aditya.joshi',   'UE23CS342A', '2026-ODD'), ('aditya.joshi',   'UE23CS352A', '2026-ODD'),
    ('nikhil.bhat',    'UE23CS341A', '2026-ODD'), ('nikhil.bhat',    'UE23MA241B', '2026-ODD'),
    ('nikhil.bhat',    'UE23CS343A', '2026-ODD'),
    ('kavya.menon',    'UE23CS352A', '2026-ODD'), ('kavya.menon',    'UE23CS353A', '2026-ODD'),
    ('kavya.menon',    'UE23MA241B', '2026-ODD'), ('kavya.menon',    'UE23CS344A', '2026-ODD'),
    ('siddharth.rao',  'UE23CS353A', '2026-ODD'), ('siddharth.rao',  'UE23CS352A', '2026-ODD'),
    ('siddharth.rao',  'UE23CS343A', '2026-ODD'), ('siddharth.rao',  'UE23CS342A', '2026-ODD'),
    ('tanvi.hegde',    'UE23CS351A', '2026-ODD'), ('tanvi.hegde',    'UE23CS341A', '2026-ODD'),
    ('tanvi.hegde',    'UE23CS344A', '2026-ODD'), ('tanvi.hegde',    'UE23CS352A', '2026-ODD'),
    -- earlier semester (a student can take a course in more than one semester)
    ('darshan.pawar',     'UE23MA241B', '2025-EVEN'), ('dhanush.biradar',    'UE23CS352A', '2025-EVEN'),
    ('karthik.iyer',   'UE23CS343A', '2025-EVEN'), ('meera.pillai',   'UE23CS351A', '2025-EVEN')
) AS v(handle, course_code, semester)
JOIN STUDENT s ON s.email = v.handle || '@scholarmesh.test'
JOIN COURSE  c ON c.course_code = v.course_code;

-- ------------------------------------------------------------ TAG (the normalise trigger lower-cases/hyphenates)
INSERT INTO TAG (tag_name)
SELECT unnest(ARRAY[
    'normalization', 'functional-dependencies', 'exam-prep', 'transactions', 'concurrency', 'indexing',
    'b-plus-tree', 'query-optimization', 'er-model', 'schema-design', 'sql', 'joins', 'cheat-sheet', 'locking',
    'regression', 'gradient-descent', 'regularization', 'overfitting', 'decision-trees', 'ensemble-learning',
    'svm', 'kernels', 'evaluation-metrics', 'classification', 'clustering', 'unsupervised-learning',
    'transformers', 'attention', 'nlp', 'word-embeddings', 'rnn', 'lstm', 'sequence-models', 'cnn',
    'computer-vision', 'backpropagation', 'neural-networks', 'tcp', 'congestion-control', 'networking',
    'protocols', 'routing', 'dns', 'scheduling', 'processes', 'virtual-memory', 'paging', 'deadlock',
    'resource-allocation', 'synchronization', 'dynamic-programming', 'graphs', 'bfs', 'dfs', 'greedy',
    'proofs', 'recurrences', 'complexity', 'eigenvalues', 'linear-algebra', 'svd', 'pca', 'vector-spaces',
    'requirements', 'software-engineering'
]);
