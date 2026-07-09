-- ============================================================================
-- MOMENTUM — Schema MySQL
-- Executado automaticamente pelo container Docker na primeira subida
-- (já dentro do banco MYSQL_DATABASE, não precisa de CREATE DATABASE/USE).
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- No modo desktop (MULTI_USER=false) só existe a linha id=1, sem login. No
-- modo web (MULTI_USER=true), cada cadastro vira uma linha de verdade com
-- email/senha — ver server/controllers/auth.controller.js.
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL DEFAULT 'Davi',
  email VARCHAR(255) NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== ROTINA / TASKS (unificado com flag is_routine) =====
CREATE TABLE IF NOT EXISTS tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  priority ENUM('low','medium','high') DEFAULT 'medium',
  status ENUM('todo','in_progress','in_review','done') DEFAULT 'todo',
  is_routine BOOLEAN DEFAULT FALSE,
  time_of_day TIME NULL,
  color VARCHAR(9) DEFAULT '#FF7A00',
  category VARCHAR(60),
  due_date DATE NULL,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS task_days (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NOT NULL,
  day_of_week TINYINT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NOT NULL,
  tag VARCHAR(40) NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_completions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NOT NULL,
  done_date DATE NOT NULL,
  completed BOOLEAN DEFAULT TRUE,
  UNIQUE KEY uniq_task_date (task_id, done_date),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- ===== FINANÇAS =====
CREATE TABLE IF NOT EXISTS accounts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  name VARCHAR(60) NOT NULL,
  type ENUM('cash','bank','card','wallet') DEFAULT 'bank',
  opening_balance DECIMAL(12,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  name VARCHAR(60) NOT NULL,
  kind ENUM('income','expense') NOT NULL,
  color VARCHAR(9) DEFAULT '#6694FF',
  icon VARCHAR(40),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  account_id INT NOT NULL,
  category_id INT NULL,
  kind ENUM('income','expense') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  description VARCHAR(200),
  tx_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category_id INT NOT NULL,
  monthly_limit DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Modelos de transação recorrente (aluguel, assinaturas...). A cada mês, ao
-- acessar Finanças, o backend gera automaticamente a transação real do mês
-- corrente a partir daqui (ver generateDueRecurringTransactions no controller).
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  account_id INT NOT NULL,
  category_id INT NULL,
  kind ENUM('income','expense') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  description VARCHAR(200),
  day_of_month TINYINT NOT NULL, -- 1-28, evita mês com menos dias
  active BOOLEAN DEFAULT TRUE,
  last_generated_date DATE NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Compras parceladas no crédito (ex.: notebook em 12x). Mesmo mecanismo
-- preguiçoso de recurring_transactions — a cada visita a Finanças, gera a
-- parcela do mês corrente se ainda não foi gerada, até bater installments_total.
CREATE TABLE IF NOT EXISTS installment_purchases (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  account_id INT NOT NULL,
  category_id INT NULL,
  description VARCHAR(200) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  installments_total TINYINT NOT NULL,
  installments_generated TINYINT NOT NULL DEFAULT 0,
  day_of_month TINYINT NOT NULL, -- 1-28, evita mês com menos dias
  last_generated_date DATE NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Caixinhas de economia — reserva separada das contas, controle manual (não
-- gera transações). Saldo é a soma de savings_box_entries (positivo=depósito,
-- negativo=resgate), calculado on-the-fly em vez de guardado (evita drift).
CREATE TABLE IF NOT EXISTS savings_boxes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  target_amount DECIMAL(12,2) NULL,
  color VARCHAR(9) DEFAULT '#6694FF',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS savings_box_entries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  box_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  entry_date DATE NOT NULL,
  note VARCHAR(200),
  FOREIGN KEY (box_id) REFERENCES savings_boxes(id) ON DELETE CASCADE
);

-- ===== NOTES =====
CREATE TABLE IF NOT EXISTS notes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  title VARCHAR(160),
  content MEDIUMTEXT,
  color VARCHAR(9) DEFAULT '#16161A',
  pinned BOOLEAN DEFAULT FALSE,
  note_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS note_tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  note_id INT NOT NULL,
  tag VARCHAR(40),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- ===== METAS (6 meses) =====
CREATE TABLE IF NOT EXISTS goals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  focus_areas VARCHAR(200),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('active','completed','abandoned') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goal_checkins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  goal_id INT NOT NULL,
  checkin_date DATE NOT NULL,
  progress TINYINT DEFAULT 0,
  note VARCHAR(300),
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);

-- vincula rotinas/tasks que alimentam uma meta (ex.: "estudar 1h" -> meta "estudos")
CREATE TABLE IF NOT EXISTS goal_task_links (
  id INT PRIMARY KEY AUTO_INCREMENT,
  goal_id INT NOT NULL,
  task_id INT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_goal_task (goal_id, task_id)
);

-- ===== ACADEMIA =====
CREATE TABLE IF NOT EXISTS exercises (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  muscle_group VARCHAR(60),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS workout_plan_exercises (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL,
  exercise_id INT NOT NULL,
  sets TINYINT DEFAULT 3,
  reps VARCHAR(20) DEFAULT '10',
  weight VARCHAR(20),
  sort_order INT DEFAULT 0,
  FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);

CREATE TABLE IF NOT EXISTS workout_schedule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL,
  day_of_week TINYINT NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL,
  log_date DATE NOT NULL,
  completed BOOLEAN DEFAULT TRUE,
  notes VARCHAR(300),
  UNIQUE KEY uniq_plan_date (plan_id, log_date),
  FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
);

-- registro de cargas/reps reais numa sessão de treino concluída
CREATE TABLE IF NOT EXISTS workout_log_entries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workout_log_id INT NOT NULL,
  exercise_id INT NOT NULL,
  sets_done TINYINT,
  reps_done VARCHAR(20),
  weight_done VARCHAR(20),
  FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO users (id, name) VALUES (1, 'Davi')
  ON DUPLICATE KEY UPDATE name = VALUES(name);
