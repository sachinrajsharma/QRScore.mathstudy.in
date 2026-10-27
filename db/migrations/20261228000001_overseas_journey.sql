-- Overseas Education Journey: a configurable, versioned workflow (templates) that generates a personalised checklist per student case.
-- Every task has an owner, status, due date, dependencies, evidence requirements and a full event history. Documents are versioned, never overwritten.
-- Case rows cascade when the student account is deleted. Idempotent like every portal migration. See lib/journey/README.md.

-- Immutable template versions. A published version is never edited; changes are published as a new version and existing cases keep theirs.
CREATE TABLE IF NOT EXISTS oj_templates (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_key VARCHAR(40) NOT NULL,
  version INT NOT NULL,
  source VARCHAR(12) NOT NULL DEFAULT 'builtin',
  hash CHAR(32) NOT NULL,
  definition LONGTEXT NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_oj_tpl UNIQUE (template_key, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oj_cases (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  template_key VARCHAR(40) NOT NULL,
  template_version INT NOT NULL,
  profile_json LONGTEXT NOT NULL,
  destination VARCHAR(20) NOT NULL,
  degree VARCHAR(8) NOT NULL,
  intake VARCHAR(30) NOT NULL DEFAULT '',
  consultant_id INT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','deferred','withdrawn','completed')),
  started_at DATETIME NOT NULL,
  imported_from_legacy TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT uq_oj_case_user UNIQUE (user_id),
  CONSTRAINT fk_ojc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojc_consultant ON oj_cases (consultant_id, status);
CREATE INDEX ix_ojc_dest ON oj_cases (destination, intake);

-- One row per university + programme + intake in a case. The unique key is what prevents duplicates; every application has its own tasks.
CREATE TABLE IF NOT EXISTS oj_applications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  university_id INT NULL,
  uni_name VARCHAR(160) NOT NULL,
  programme VARCHAR(160) NOT NULL,
  intake VARCHAR(30) NOT NULL,
  uni_key VARCHAR(160) NOT NULL,
  prog_key VARCHAR(160) NOT NULL,
  intake_key VARCHAR(30) NOT NULL,
  category VARCHAR(12) NOT NULL DEFAULT 'target' CHECK (category IN ('ambitious','target','safer')),
  status VARCHAR(16) NOT NULL DEFAULT 'shortlisted' CHECK (status IN ('shortlisted','preparing','submitted','under_review','offer','rejected','waitlisted','accepted','declined','withdrawn','deferred')),
  offer_type VARCHAR(16) NOT NULL DEFAULT '' CHECK (offer_type IN ('','conditional','unconditional')),
  offer_conditions VARCHAR(1000) NOT NULL DEFAULT '',
  offer_deadline DATE NULL,
  deposit_amount VARCHAR(40) NOT NULL DEFAULT '',
  tuition_note VARCHAR(120) NOT NULL DEFAULT '',
  scholarship_note VARCHAR(120) NOT NULL DEFAULT '',
  approved_at DATETIME NULL,
  submitted_at DATETIME NULL,
  closed_reason VARCHAR(255) NOT NULL DEFAULT '',
  legacy_application_id INT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT uq_oj_app UNIQUE (case_id, uni_key, prog_key, intake_key),
  CONSTRAINT fk_oja_case FOREIGN KEY (case_id) REFERENCES oj_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_oja_status ON oj_applications (case_id, status);

CREATE TABLE IF NOT EXISTS oj_tasks (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  application_id INT NULL,
  app_key INT NOT NULL DEFAULT 0,
  attempt INT NOT NULL DEFAULT 1,
  template_key VARCHAR(40) NOT NULL,
  template_version INT NOT NULL,
  task_key VARCHAR(60) NOT NULL,
  stage SMALLINT NOT NULL,
  sub VARCHAR(80) NOT NULL DEFAULT '',
  title VARCHAR(200) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  owner_role VARCHAR(12) NOT NULL CHECK (owner_role IN ('student','consultant','university')),
  owner_user_id INT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status VARCHAR(24) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','ready_to_start','in_progress','submitted_for_review','changes_requested','waiting_on_student','waiting_on_university','blocked','completed','not_applicable')),
  due_at DATETIME NULL,
  review VARCHAR(12) NOT NULL DEFAULT 'none' CHECK (review IN ('none','consultant')),
  criteria VARCHAR(400) NOT NULL DEFAULT '',
  evidence_json LONGTEXT NOT NULL,
  min_level TINYINT NULL,
  external TINYINT NOT NULL DEFAULT 0,
  auto_check VARCHAR(30) NULL,
  action_label VARCHAR(40) NOT NULL DEFAULT '',
  blocked_reason VARCHAR(255) NOT NULL DEFAULT '',
  na_reason VARCHAR(255) NOT NULL DEFAULT '',
  na_requested_by INT NULL,
  na_requested_at DATETIME NULL,
  na_approved_by INT NULL,
  started_at DATETIME NULL,
  submitted_at DATETIME NULL,
  completed_at DATETIME NULL,
  completed_by INT NULL,
  obsolete TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT uq_oj_task UNIQUE (case_id, task_key, app_key, attempt),
  CONSTRAINT fk_ojt_case FOREIGN KEY (case_id) REFERENCES oj_cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_ojt_app FOREIGN KEY (application_id) REFERENCES oj_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojt_case ON oj_tasks (case_id, stage, status);
CREATE INDEX ix_ojt_status ON oj_tasks (status, due_at);
CREATE INDEX ix_ojt_review ON oj_tasks (status, submitted_at);

-- grp is '' for a plain dependency; dependencies sharing a non-empty grp are satisfied when any one is done.
CREATE TABLE IF NOT EXISTS oj_task_deps (
  task_id INT NOT NULL,
  depends_on INT NOT NULL,
  grp VARCHAR(80) NOT NULL DEFAULT '',
  PRIMARY KEY (task_id, depends_on),
  CONSTRAINT fk_ojd_task FOREIGN KEY (task_id) REFERENCES oj_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_ojd_dep FOREIGN KEY (depends_on) REFERENCES oj_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojd_dep ON oj_task_deps (depends_on);

-- Append-only audit trail. Rows are never updated or deleted by the application.
CREATE TABLE IF NOT EXISTS oj_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  task_id INT NULL,
  application_id INT NULL,
  actor_id INT NULL,
  actor_role VARCHAR(10) NOT NULL,
  kind VARCHAR(30) NOT NULL,
  from_status VARCHAR(24) NOT NULL DEFAULT '',
  to_status VARCHAR(24) NOT NULL DEFAULT '',
  note VARCHAR(1000) NOT NULL DEFAULT '',
  meta_json VARCHAR(2000) NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_oje_case FOREIGN KEY (case_id) REFERENCES oj_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_oje_case ON oj_events (case_id, id);
CREATE INDEX ix_oje_task ON oj_events (task_id, id);
CREATE INDEX ix_oje_kind ON oj_events (kind, created_at);

-- Documents are versioned: a new upload is version n+1 and the previous one becomes "superseded", it is never overwritten.
CREATE TABLE IF NOT EXISTS oj_documents (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  doc_key VARCHAR(30) NOT NULL,
  app_key INT NOT NULL DEFAULT 0,
  application_id INT NULL,
  version INT NOT NULL,
  original_name VARCHAR(160) NOT NULL,
  stored_name VARCHAR(80) NOT NULL,
  mime VARCHAR(80) NOT NULL,
  size INT NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','verified','rejected','expired','superseded')),
  reject_reason VARCHAR(255) NOT NULL DEFAULT '',
  expires_on DATE NULL,
  restricted TINYINT NOT NULL DEFAULT 0,
  uploaded_by INT NOT NULL,
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT uq_oj_doc UNIQUE (case_id, doc_key, app_key, version),
  CONSTRAINT fk_ojdoc_case FOREIGN KEY (case_id) REFERENCES oj_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojdoc_status ON oj_documents (status, created_at);

CREATE TABLE IF NOT EXISTS oj_doc_access (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  case_id INT NOT NULL,
  viewer_id INT NOT NULL,
  viewer_role VARCHAR(10) NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojda_doc ON oj_doc_access (doc_id, id);

-- Evidence attached to a task. A document row points at a document version; its live status decides whether it still counts.
CREATE TABLE IF NOT EXISTS oj_evidence (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  case_id INT NOT NULL,
  kind VARCHAR(14) NOT NULL CHECK (kind IN ('document','text','link','confirmation')),
  doc_id INT NULL,
  doc_key VARCHAR(30) NULL,
  text_value VARCHAR(2000) NULL,
  url VARCHAR(500) NULL,
  by_role VARCHAR(10) NOT NULL,
  by_user INT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_oje2_task FOREIGN KEY (task_id) REFERENCES oj_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojev_task ON oj_evidence (task_id, id);

CREATE TABLE IF NOT EXISTS oj_comm (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  application_id INT NULL,
  author_id INT NOT NULL,
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('note','call','email','meeting','message')),
  direction VARCHAR(10) NOT NULL DEFAULT 'internal' CHECK (direction IN ('internal','student','university')),
  subject VARCHAR(160) NOT NULL DEFAULT '',
  body VARCHAR(2000) NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_ojcm_case FOREIGN KEY (case_id) REFERENCES oj_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojcm_case ON oj_comm (case_id, id);

CREATE TABLE IF NOT EXISTS oj_handovers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  from_consultant INT NULL,
  to_consultant INT NULL,
  by_user INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_ojh_case FOREIGN KEY (case_id) REFERENCES oj_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oj_reminders (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  task_id INT NULL,
  for_user INT NOT NULL,
  remind_on DATE NOT NULL,
  body VARCHAR(300) NOT NULL,
  created_by INT NOT NULL,
  done_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_ojr_case FOREIGN KEY (case_id) REFERENCES oj_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojr_due ON oj_reminders (for_user, remind_on, done_at);

-- (user_id, dedupe_key) is unique, so the same reminder or escalation can never be created twice.
CREATE TABLE IF NOT EXISTS oj_notifications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  case_id INT NULL,
  task_id INT NULL,
  kind VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(600) NOT NULL DEFAULT '',
  link VARCHAR(200) NOT NULL DEFAULT '',
  dedupe_key VARCHAR(120) NOT NULL,
  read_at DATETIME NULL,
  emailed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT uq_ojn UNIQUE (user_id, dedupe_key),
  CONSTRAINT fk_ojn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojn_user ON oj_notifications (user_id, read_at, id);

CREATE TABLE IF NOT EXISTS oj_notif_prefs (
  user_id INT NOT NULL PRIMARY KEY,
  email_enabled TINYINT NOT NULL DEFAULT 1,
  inapp_enabled TINYINT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ojnp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oj_settings (
  k VARCHAR(40) NOT NULL PRIMARY KEY,
  v VARCHAR(2000) NOT NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exceptions (visa refusal, rejection, deferral, university change, withdrawal, refund). Requested by anyone on the case, applied by staff.
-- Applying one adds recovery tasks and closes affected ones; nothing is deleted.
CREATE TABLE IF NOT EXISTS oj_exceptions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  application_id INT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('visa_refusal','visa_reapply','rejection','deferral','change_university','withdrawal','refund')),
  status VARCHAR(12) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','applied','declined')),
  reason VARCHAR(500) NOT NULL,
  detail_json VARCHAR(1000) NOT NULL DEFAULT '{}',
  requested_by INT NOT NULL,
  applied_by INT NULL,
  created_at DATETIME NOT NULL,
  applied_at DATETIME NULL,
  CONSTRAINT fk_ojx_case FOREIGN KEY (case_id) REFERENCES oj_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX ix_ojx_case ON oj_exceptions (case_id, status);
