-- message_content_idx is no longer unique
DROP INDEX message_content_idx;
CREATE INDEX message_content_idx ON message_content(message_internal_id);
