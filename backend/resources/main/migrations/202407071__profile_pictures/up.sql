CREATE TABLE profile_picture (
  ds_uuid             BLOB NOT NULL REFERENCES dataset (uuid),
  user_id             INTEGER NOT NULL,
  path                TEXT NOT NULL,
  "order"             INTEGER NOT NULL,
  frame_x             INTEGER,
  frame_y             INTEGER,
  frame_w             INTEGER,
  frame_h             INTEGER,
  PRIMARY KEY (ds_uuid, user_id, path),
  FOREIGN KEY (ds_uuid, user_id) REFERENCES user (ds_uuid, id)
);
