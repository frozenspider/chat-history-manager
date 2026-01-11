--
-- Schema
--
CREATE TABLE wa_contacts(_id INTEGER PRIMARY KEY AUTOINCREMENT,jid TEXT NOT NULL,is_whatsapp_user BOOLEAN NOT NULL,status TEXT,status_timestamp INTEGER,number TEXT,raw_contact_id INTEGER,display_name TEXT,phone_type INTEGER,phone_label TEXT,photo_ts INTEGER,thumb_ts INTEGER,photo_id_timestamp INTEGER,given_name TEXT,family_name TEXT,wa_name TEXT,sort_name TEXT,nickname TEXT,company TEXT,title TEXT,status_autodownload_disabled INTEGER,keep_timestamp INTEGER,is_spam_reported INTEGER,is_sidelist_synced BOOLEAN DEFAULT 0,is_business_synced BOOLEAN DEFAULT 0,disappearing_mode_duration INTEGER,disappearing_mode_timestamp LONG,history_sync_initial_phash TEXT,is_starred BOOLEAN,is_wa_created_contact BOOLEAN,sync_policy INTEGER,status_emoji TEXT,is_contact_synced INTEGER,is_reachable INTEGER, external_user_state INTEGER, disappearing_mode_support_disabled INTEGER);

--
-- Data
--

-- Myself
INSERT INTO wa_contacts VALUES(33,'00000@s.whatsapp.net',1,'.',-1,'+00000',74,'Hey look it''s me!',7,NULL,-1,-1,1756457061765,'Hey look','it''s me!',NULL,'Hey look it''s me!',NULL,NULL,NULL,NULL,NULL,0,0,1,NULL,NULL,NULL,0,NULL,0,'',1,NULL,0,NULL);
INSERT INTO wa_contacts VALUES(29,'998915209824@s.whatsapp.net',1,'.',-1,'+998915209824',69,'Я (Билайн)',7,NULL,-1,-1,1756457061765,'Я','(Билайн)',NULL,'Я (Билайн)',NULL,NULL,NULL,NULL,NULL,0,0,1,NULL,NULL,NULL,0,NULL,0,'',1,NULL,0,NULL);

-- User 1
INSERT INTO wa_contacts VALUES(181,'111111@s.whatsapp.net',1,'User 1 status message.',-1,NULL,NULL,NULL,NULL,NULL,0,1750772787,1689079868147,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,1,1,NULL,NULL,NULL,0,NULL,0,'',1,1,0,NULL);

