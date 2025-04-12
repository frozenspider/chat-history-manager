ALTER TABLE message_content ADD COLUMN file_name TEXT;
UPDATE message_content SET file_name = title, title = NULL WHERE element_type = 'file';
