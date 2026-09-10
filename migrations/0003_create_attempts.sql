CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  mcq_id TEXT NOT NULL,
  selected TEXT NOT NULL CHECK (selected IN ('A', 'B', 'C', 'D')),
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE
);

CREATE INDEX idx_attempts_mcq_id ON attempts (mcq_id);
CREATE INDEX idx_attempts_created_at ON attempts (created_at);
