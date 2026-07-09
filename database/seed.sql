-- ============================================================================
-- MOMENTUM — Seed de exemplo
-- Todas as datas são relativas a CURDATE(), então o histórico (streaks,
-- heatmaps, comparativo de mês) sempre faz sentido, não importa quando este
-- arquivo for executado. Roda automaticamente depois do schema.sql no
-- primeiro boot do container Docker.
-- ============================================================================

SET NAMES utf8mb4;

-- ============================== ROTINAS =====================================
-- (linhas em `tasks` com is_routine = 1)
INSERT INTO tasks (id, user_id, title, description, priority, status, is_routine, time_of_day, color, category, due_date) VALUES
(1, 1, 'Beber 2L de água', 'Manter a hidratação ao longo do dia.', 'medium', 'todo', 1, NULL, '#34D399', 'saúde', NULL),
(2, 1, 'Estudar inglês', '30-60min de estudo (app + leitura).', 'medium', 'todo', 1, '19:00:00', '#2365FF', 'estudo', NULL),
(3, 1, 'Meditar 10 minutos', 'Respiração + meditação guiada ao acordar.', 'low', 'todo', 1, '07:00:00', '#6694FF', 'saúde', NULL),
(4, 1, 'Arrumar a cama', 'Primeira coisa ao levantar.', 'low', 'todo', 1, NULL, '#FF9A3C', 'casa', NULL);

INSERT INTO task_days (task_id, day_of_week) VALUES
(1,0),(1,1),(1,2),(1,3),(1,4),(1,5),(1,6),         -- água: todo dia
(2,1),(2,2),(2,3),(2,4),(2,5),                      -- inglês: seg-sex
(3,0),(3,1),(3,2),(3,3),(3,4),(3,5),(3,6),         -- meditar: todo dia
(4,0),(4,1),(4,2),(4,3),(4,4),(4,5),(4,6);         -- arrumar cama: todo dia

-- ============================== TASKS (KANBAN) ===============================
INSERT INTO tasks (id, user_id, title, description, priority, status, is_routine, color, category, due_date, sort_order) VALUES
(5, 1, 'Revisar orçamento do mês', 'Conferir gastos e ajustar categorias estouradas.', 'high', 'todo', 0, '#F43F5E', 'finanças', CURDATE() + INTERVAL 3 DAY, 0),
(6, 1, 'Comprar presente de aniversário', 'Ideia: algo relacionado a hobby.', 'medium', 'todo', 0, '#FF7A00', 'pessoal', CURDATE() + INTERVAL 7 DAY, 1),
(7, 1, 'Ler 20 páginas do livro atual', NULL, 'low', 'in_progress', 0, '#34D399', 'leitura', NULL, 0),
(8, 1, 'Organizar fotos do celular', 'Fazer backup e limpar duplicadas.', 'low', 'todo', 0, '#6694FF', 'pessoal', NULL, 2),
(9, 1, 'Preparar apresentação do projeto', 'Slides + roteiro de fala.', 'high', 'in_progress', 0, '#F43F5E', 'trabalho', CURDATE() + INTERVAL 2 DAY, 1),
(10, 1, 'Atualizar currículo', 'Incluir projetos dos últimos 6 meses.', 'medium', 'in_review', 0, '#FF9A3C', 'carreira', NULL, 0),
(11, 1, 'Marcar consulta com dentista', NULL, 'medium', 'done', 0, '#34D399', 'saúde', CURDATE() - INTERVAL 4 DAY, 0),
(12, 1, 'Renovar assinatura do domínio', NULL, 'high', 'done', 0, '#F43F5E', 'trabalho', CURDATE() - INTERVAL 10 DAY, 1);

INSERT INTO task_tags (task_id, tag) VALUES
(5,'orçamento'),(5,'finanças'),
(6,'pessoal'),
(7,'leitura'),
(9,'trabalho'),(9,'apresentação'),
(10,'carreira');

-- Histórico de conclusão das rotinas (últimos dias, alinhado aos dias agendados)
-- task 1 (água, todo dia): 12 dias seguidos concluídos -> streak alto
INSERT INTO task_completions (task_id, done_date, completed)
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n < 11)
SELECT 1, CURDATE() - INTERVAL n DAY, 1 FROM seq;

-- task 2 (inglês, seg-sex): últimos 20 dias, só nos dias úteis agendados -> streak cheio
INSERT INTO task_completions (task_id, done_date, completed)
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n < 19)
SELECT 2, CURDATE() - INTERVAL n DAY, 1 FROM seq
WHERE (DAYOFWEEK(CURDATE() - INTERVAL n DAY) - 1) IN (1,2,3,4,5);

-- task 3 (meditar, todo dia): 20 dias, pulando o dia "4 atrás" -> streak menor (quebrado)
INSERT INTO task_completions (task_id, done_date, completed)
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n < 19)
SELECT 3, CURDATE() - INTERVAL n DAY, 1 FROM seq
WHERE n <> 4;

-- task 4 (arrumar cama, todo dia): só hoje e ontem -> streak = 2
INSERT INTO task_completions (task_id, done_date, completed) VALUES
(4, CURDATE(), 1),
(4, CURDATE() - INTERVAL 1 DAY, 1);

-- ============================== FINANÇAS =====================================
INSERT INTO accounts (id, user_id, name, type, opening_balance) VALUES
(1, 1, 'Nubank', 'bank', 1500.00),
(2, 1, 'Carteira', 'cash', 120.00);

INSERT INTO categories (id, name, kind, color, icon) VALUES
(1, 'Salário', 'income', '#34D399', 'wallet'),
(2, 'Freelance', 'income', '#2365FF', 'laptop'),
(3, 'Outros', 'income', '#A1A1AA', 'sparkles'),
(4, 'Mercado', 'expense', '#FF9A3C', 'shopping-cart'),
(5, 'Transporte', 'expense', '#F43F5E', 'car'),
(6, 'Lazer', 'expense', '#FF7A00', 'gamepad'),
(7, 'Moradia', 'expense', '#6694FF', 'home'),
(8, 'Saúde', 'expense', '#34D399', 'pill'),
(9, 'Assinaturas', 'expense', '#2365FF', 'smartphone');

INSERT INTO transactions (account_id, category_id, kind, amount, description, tx_date) VALUES
(1, 1, 'income', 4200.00, 'Salário', CURDATE() - INTERVAL 5 DAY),
(1, 1, 'income', 4200.00, 'Salário', CURDATE() - INTERVAL 35 DAY),
(1, 2, 'income', 850.00, 'Projeto freelance', CURDATE() - INTERVAL 20 DAY),
(2, 3, 'income', 150.00, 'Venda item usado', CURDATE() - INTERVAL 12 DAY),
(1, 7, 'expense', 1300.00, 'Aluguel', CURDATE() - INTERVAL 4 DAY),
(1, 7, 'expense', 1300.00, 'Aluguel', CURDATE() - INTERVAL 34 DAY),
(2, 4, 'expense', 187.40, 'Mercado da semana', CURDATE()),
(1, 4, 'expense', 210.90, 'Mercado da semana', CURDATE() - INTERVAL 6 DAY),
(1, 4, 'expense', 165.30, 'Mercado da semana', CURDATE() - INTERVAL 13 DAY),
(1, 4, 'expense', 245.00, 'Mercado do mês passado', CURDATE() - INTERVAL 40 DAY),
(2, 5, 'expense', 32.00, 'Uber', CURDATE() - INTERVAL 1 DAY),
(2, 5, 'expense', 18.50, 'Ônibus', CURDATE() - INTERVAL 3 DAY),
(1, 5, 'expense', 220.00, 'Combustível', CURDATE() - INTERVAL 16 DAY),
(1, 6, 'expense', 89.90, 'Cinema', CURDATE() - INTERVAL 2 DAY),
(1, 6, 'expense', 120.00, 'Jantar com amigos', CURDATE() - INTERVAL 8 DAY),
(1, 6, 'expense', 65.00, 'Streaming de jogo', CURDATE() - INTERVAL 45 DAY),
(1, 8, 'expense', 95.00, 'Farmácia', CURDATE() - INTERVAL 10 DAY),
(1, 9, 'expense', 39.90, 'Spotify', CURDATE() - INTERVAL 7 DAY),
(1, 9, 'expense', 55.90, 'Streaming de vídeo', CURDATE() - INTERVAL 7 DAY),
(1, 9, 'expense', 39.90, 'Spotify', CURDATE() - INTERVAL 37 DAY),
(2, 4, 'expense', 42.00, 'Padaria', CURDATE() - INTERVAL 22 DAY),
(1, 5, 'expense', 210.00, 'Combustível', CURDATE() - INTERVAL 46 DAY),
(1, 6, 'expense', 78.00, 'Show', CURDATE() - INTERVAL 55 DAY),
(1, 8, 'expense', 140.00, 'Consulta médica', CURDATE() - INTERVAL 50 DAY),
(2, 4, 'expense', 98.50, 'Mercado', CURDATE() - INTERVAL 28 DAY);

INSERT INTO budgets (category_id, monthly_limit) VALUES
(4, 800.00),
(6, 300.00),
(9, 150.00);

-- ============================== NOTES =========================================
INSERT INTO notes (title, content, color, pinned, note_date) VALUES
('Ideias para o fim de semana', 'Trilha na serra, cinema novo, testar aquela receita de massa.', '#16161A', 1, CURDATE()),
('Insight da reunião', 'Focar em métricas de retenção no próximo ciclo. Revisar dashboard com o time.', '#1B2A4A', 0, CURDATE() - INTERVAL 1 DAY),
('Livros para ler', '1. Atomic Habits (relendo)\n2. Clean Architecture\n3. Sapiens', '#2A1B3D', 1, CURDATE() - INTERVAL 3 DAY),
('Diário — dia difícil no trabalho', 'Deploy quebrou em produção, mas resolvemos em 40min. Aprendizado: melhorar rollback.', '#16161A', 0, CURDATE() - INTERVAL 7 DAY),
('Presentes de fim de ano', 'Lista de ideias pra família. Orçamento: até 150 por pessoa.', '#3D2A1B', 0, CURDATE() - INTERVAL 10 DAY),
('Rotina matinal ideal', 'Acordar 6h, meditar, água, treino, café da manhã, revisar dia.', '#1B3D2A', 0, CURDATE() - INTERVAL 20 DAY);

INSERT INTO note_tags (note_id, tag) VALUES
(1,'lazer'),(1,'fds'),
(2,'trabalho'),(2,'insights'),
(3,'leitura'),
(4,'trabalho'),(4,'diário'),
(5,'planejamento'),
(6,'hábitos');

-- ============================== METAS (6 meses) ================================
INSERT INTO goals (id, user_id, title, description, focus_areas, start_date, end_date, status) VALUES
(1, 1, 'Foco em academia e estudos', 'Consolidar rotina de treino consistente e avançar no inglês nos próximos 6 meses.',
 'academia,estudos', CURDATE() - INTERVAL 45 DAY, (CURDATE() - INTERVAL 45 DAY) + INTERVAL 180 DAY, 'active');

INSERT INTO goal_checkins (goal_id, checkin_date, progress, note) VALUES
(1, CURDATE() - INTERVAL 45 DAY, 5, 'Comecei! Defini os planos de treino e a agenda de estudo.'),
(1, CURDATE() - INTERVAL 38 DAY, 12, 'Primeira semana completa de treinos.'),
(1, CURDATE() - INTERVAL 31 DAY, 20, 'Inglês virando hábito, treino ainda irregular.'),
(1, CURDATE() - INTERVAL 24 DAY, 30, 'Consistência melhorando bastante essa semana.'),
(1, CURDATE() - INTERVAL 17 DAY, 40, 'Bati recorde de carga no supino.'),
(1, CURDATE() - INTERVAL 10 DAY, 50, 'Metade do caminho em breve, mantendo o ritmo.'),
(1, CURDATE() - INTERVAL 3 DAY, 58, 'Ótima semana, treino e estudo em dia.');

INSERT INTO goal_task_links (goal_id, task_id) VALUES
(1, 2), -- estudar inglês
(1, 3); -- meditar (bem-estar/consistência)

-- ============================== ACADEMIA =======================================
INSERT INTO exercises (id, name, muscle_group) VALUES
(1, 'Supino reto', 'peito'),
(2, 'Supino inclinado', 'peito'),
(3, 'Crucifixo', 'peito'),
(4, 'Puxada frente', 'costas'),
(5, 'Remada baixa', 'costas'),
(6, 'Levantamento terra', 'costas'),
(7, 'Agachamento livre', 'perna'),
(8, 'Leg press', 'perna'),
(9, 'Cadeira extensora', 'perna'),
(10, 'Desenvolvimento militar', 'ombro'),
(11, 'Rosca direta', 'braço'),
(12, 'Tríceps corda', 'braço'),
(13, 'Elevação lateral', 'ombro'),
(14, 'Prancha', 'core');

INSERT INTO workout_plans (id, user_id, name, notes) VALUES
(1, 1, 'Peito e Tríceps', 'Foco em volume, descanso de 60-90s entre séries.'),
(2, 1, 'Costas e Bíceps', 'Priorizar boa forma no levantamento terra.'),
(3, 1, 'Perna e Ombro', 'Aquecer bem antes do agachamento.');

INSERT INTO workout_plan_exercises (plan_id, exercise_id, sets, reps, weight, sort_order) VALUES
(1, 1, 4, '8-10', '60kg', 0),
(1, 2, 3, '10-12', '24kg', 1),
(1, 3, 3, '12-15', '14kg', 2),
(1, 12, 3, '12-15', '20kg', 3),
(2, 4, 4, '8-10', '55kg', 0),
(2, 5, 3, '10-12', '45kg', 1),
(2, 6, 4, '6-8', '80kg', 2),
(2, 11, 3, '10-12', '14kg', 3),
(3, 7, 4, '8-10', '70kg', 0),
(3, 8, 3, '10-12', '120kg', 1),
(3, 9, 3, '12-15', '35kg', 2),
(3, 10, 3, '8-10', '30kg', 3),
(3, 13, 3, '12-15', '8kg', 4),
(3, 14, 3, '45s', NULL, 5);

INSERT INTO workout_schedule (plan_id, day_of_week) VALUES
(1, 1), (1, 4),   -- Peito e Tríceps: seg, qui
(2, 2), (2, 5),   -- Costas e Bíceps: ter, sex
(3, 3), (3, 6);   -- Perna e Ombro: qua, sáb

-- Histórico de treinos: últimas ~6 semanas, só nos dias agendados de cada plano,
-- pulando um dia aleatório por plano pra simular vida real (streak não perfeito).
INSERT INTO workout_logs (plan_id, log_date, completed, notes)
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n < 41)
SELECT 1, CURDATE() - INTERVAL n DAY, 1, NULL FROM seq
WHERE (DAYOFWEEK(CURDATE() - INTERVAL n DAY) - 1) IN (1,4) AND n <> 10;

INSERT INTO workout_logs (plan_id, log_date, completed, notes)
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n < 41)
SELECT 2, CURDATE() - INTERVAL n DAY, 1, NULL FROM seq
WHERE (DAYOFWEEK(CURDATE() - INTERVAL n DAY) - 1) IN (2,5) AND n <> 9;

INSERT INTO workout_logs (plan_id, log_date, completed, notes)
WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n < 41)
SELECT 3, CURDATE() - INTERVAL n DAY, 1, NULL FROM seq
WHERE (DAYOFWEEK(CURDATE() - INTERVAL n DAY) - 1) IN (3,6) AND n <> 11;

-- Log detalhado da sessão mais recente do plano 1 (se existir)
INSERT INTO workout_log_entries (workout_log_id, exercise_id, sets_done, reps_done, weight_done)
SELECT wl.id, 1, 4, '8,8,7,6', '62kg' FROM workout_logs wl
WHERE wl.plan_id = 1 ORDER BY wl.log_date DESC LIMIT 1;

INSERT INTO workout_log_entries (workout_log_id, exercise_id, sets_done, reps_done, weight_done)
SELECT wl.id, 12, 3, '15,13,12', '20kg' FROM workout_logs wl
WHERE wl.plan_id = 1 ORDER BY wl.log_date DESC LIMIT 1;
