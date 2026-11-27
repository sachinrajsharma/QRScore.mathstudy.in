-- Support tickets, second stage: everything the stand-alone support-ticket-system has that the portal module lacked.
-- Guest tickets with a private link, attachments, anti-spam (spam folder, blocklist), merge, reply templates,
-- admin-editable categories. Repeatable like every portal migration (duplicate column / index errors are skipped by the runner).

-- A guest has no account: user_id may now be empty. The name and email the person gave are kept on the ticket itself.
ALTER TABLE support_tickets MODIFY user_id INT NULL;
ALTER TABLE support_tickets ADD COLUMN name VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE support_tickets ADD COLUMN email VARCHAR(190) NOT NULL DEFAULT '';
ALTER TABLE support_tickets ADD COLUMN phone VARCHAR(30) NULL;
ALTER TABLE support_tickets ADD COLUMN access_token CHAR(48) NULL;
ALTER TABLE support_tickets ADD COLUMN browser_info VARCHAR(400) NULL;
ALTER TABLE support_tickets ADD COLUMN ip VARCHAR(64) NULL;
ALTER TABLE support_tickets ADD COLUMN spam_score INT NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN is_spam TINYINT NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN merged_into INT NULL;

-- Tickets raised before this migration came from signed-in members: copy their name and email onto the ticket, and give each a private link.
UPDATE support_tickets t JOIN users u ON u.id = t.user_id SET t.name = u.name, t.email = u.email WHERE t.email = '';
UPDATE support_tickets SET access_token = LOWER(CONCAT(SUBSTRING(MD5(CONCAT(id, RAND(), UUID())), 1, 24), SUBSTRING(MD5(CONCAT(UUID(), RAND(), id)), 1, 24))) WHERE access_token IS NULL;

CREATE UNIQUE INDEX uq_support_ticket_token ON support_tickets (access_token);
CREATE INDEX ix_support_ticket_email ON support_tickets (email, created_at);
CREATE INDEX ix_support_ticket_ip ON support_tickets (ip, created_at);
CREATE INDEX ix_support_ticket_spam ON support_tickets (is_spam, status);

-- Files on a ticket. The bytes live in private storage (bucket "support"); downloads go through a gated route.
CREATE TABLE IF NOT EXISTS support_attachments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  message_id BIGINT NULL,
  orig_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  uploaded_by VARCHAR(10) NOT NULL DEFAULT 'customer',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_support_att_name UNIQUE (stored_name),
  CONSTRAINT fk_support_att_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_support_att_msg FOREIGN KEY (message_id) REFERENCES support_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_support_att_ticket ON support_attachments (ticket_id);

-- Categories the team can rename, add and switch off. `slug` is what support_tickets.category already holds, so old tickets keep working.
CREATE TABLE IF NOT EXISTS support_categories (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(30) NOT NULL,
  name VARCHAR(80) NOT NULL,
  default_priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  sort_order INT NOT NULL DEFAULT 100,
  is_active TINYINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_support_cat_slug UNIQUE (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO support_categories (slug, name, default_priority, sort_order) VALUES
  ('billing', 'Billing and payments', 'high', 1),
  ('account', 'Account and login', 'high', 2),
  ('courses', 'Courses and learning', 'medium', 3),
  ('internships', 'Internships and applications', 'medium', 4),
  ('abroad', 'Study abroad', 'medium', 5),
  ('technical', 'Something is not working', 'high', 6),
  ('feedback', 'Feedback or an idea', 'low', 7),
  ('other', 'Something else', 'low', 8);

-- Canned replies. {name} and {order} are filled in when a template is used.
CREATE TABLE IF NOT EXISTS support_templates (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_support_tpl_title UNIQUE (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO support_templates (title, body) VALUES
  ('Request more details', 'Hello {name},\n\nThank you for contacting us about {order}. To look into this we need a little more detail: what you expected to happen, what happened instead, and any error message you saw. Screenshots help a lot.\n\n- GrowQR Support'),
  ('Issue fixed, please confirm', 'Hello {name},\n\nWe have fixed the problem you reported. Please check and reply if anything is still wrong; otherwise this ticket will close automatically in a few days.\n\nThank you for your patience.\n\n- GrowQR Support'),
  ('Closing, no reply received', 'Hello {name},\n\nWe have not heard back, so we are closing this ticket for now. You can open a new ticket at any time and we will pick it up from there.\n\n- GrowQR Support');

-- Senders the team has blocked as spammers: an exact email, a whole domain, or an IP address.
CREATE TABLE IF NOT EXISTS support_blocklist (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(10) NOT NULL,
  value VARCHAR(190) NOT NULL,
  reason VARCHAR(255) NULL,
  created_by VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_support_block UNIQUE (kind, value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
