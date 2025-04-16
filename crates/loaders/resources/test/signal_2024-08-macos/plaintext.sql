--
-- Schema
--

CREATE TABLE conversations(
    id                    STRING PRIMARY KEY ASC,
    json                  TEXT,
    active_at             INTEGER,
    type                  STRING,
    members               TEXT,
    name                  TEXT,
    profileName           TEXT,
    profileFamilyName     TEXT,
    profileFullName       TEXT,
    e164                  TEXT,
    serviceId             TEXT,
    groupId               TEXT,
    profileLastFetchedAt  INTEGER,
    expireTimerVersion    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE messages(
    rowid                       INTEGER PRIMARY KEY ASC,
    id                          STRING UNIQUE,
    json                        TEXT,
    readStatus                  INTEGER,
    expires_at                  INTEGER,
    sent_at                     INTEGER,
    schemaVersion               INTEGER,
    conversationId              STRING,
    received_at                 INTEGER,
    source                      STRING,
    hasAttachments              INTEGER,
    hasFileAttachments          INTEGER,
    hasVisualMediaAttachments   INTEGER,
    expireTimer                 INTEGER,
    expirationStartTimestamp    INTEGER,
    type                        STRING,
    body                        TEXT,
    messageTimer                INTEGER,
    messageTimerStart           INTEGER,
    messageTimerExpiresAt       INTEGER,
    isErased                    INTEGER,
    isViewOnce                  INTEGER,
    sourceServiceId             TEXT,
    serverGuid                  STRING NULL,
    sourceDevice                INTEGER,
    storyId                     STRING,
    isStory                     INTEGER GENERATED ALWAYS AS (type IS 'story'),
    isChangeCreatedByUs         INTEGER NOT NULL DEFAULT 0,
    isTimerChangeFromSync       INTEGER GENERATED ALWAYS AS (json_extract(json, '$.expirationTimerUpdate.fromSync') IS 1),
    seenStatus                  NUMBER DEFAULT 0,
    storyDistributionListId     STRING,
    expiresAt                   INT GENERATED ALWAYS AS (ifnull(
      expirationStartTimestamp + (expireTimer * 1000),
      9007199254740991
    )),
    isUserInitiatedMessage      INTEGER GENERATED ALWAYS AS (
      type IS NULL
      OR
      type NOT IN (
        'change-number-notification',
        'contact-removed-notification',
        'conversation-merge',
        'group-v1-migration',
        'group-v2-change',
        'keychange',
        'message-history-unsynced',
        'profile-change',
        'story',
        'universal-timer-notification',
        'verified-change'
      )
    ),
    mentionsMe                  INTEGER NOT NULL DEFAULT 0,
    isGroupLeaveEvent           INTEGER GENERATED ALWAYS AS (
      type IS 'group-v2-change' AND
      json_array_length(json_extract(json, '$.groupV2Change.details')) IS 1 AND
      json_extract(json, '$.groupV2Change.details[0].type') IS 'member-remove' AND
      json_extract(json, '$.groupV2Change.from') IS NOT NULL AND
      json_extract(json, '$.groupV2Change.from') IS json_extract(json, '$.groupV2Change.details[0].aci')
    ),
    isGroupLeaveEventFromOther  INTEGER GENERATED ALWAYS AS (isGroupLeaveEvent IS 1 AND isChangeCreatedByUs IS 0),
    callId                      TEXT GENERATED ALWAYS AS (json_extract(json, '$.callId')),
    shouldAffectPreview         INTEGER GENERATED ALWAYS AS (
      type IS NULL
      OR
      type NOT IN (
        'change-number-notification',
        'contact-removed-notification',
        'conversation-merge',
        'group-v1-migration',
        'keychange',
        'message-history-unsynced',
        'profile-change',
        'story',
        'universal-timer-notification',
        'verified-change'
      )
      AND NOT (
        type IS 'message-request-response-event'
        AND json_extract(json, '$.messageRequestResponseEvent') IN ('ACCEPT', 'BLOCK', 'UNBLOCK')
      )
    ),
    shouldAffectActivity        INTEGER GENERATED ALWAYS AS (
      type IS NULL
      OR
      type NOT IN (
        'change-number-notification',
        'contact-removed-notification',
        'conversation-merge',
        'group-v1-migration',
        'keychange',
        'message-history-unsynced',
        'profile-change',
        'story',
        'universal-timer-notification',
        'verified-change'
      )
      AND NOT (
        type IS 'message-request-response-event'
        AND json_extract(json, '$.messageRequestResponseEvent') IN ('ACCEPT', 'BLOCK', 'UNBLOCK')
      )
    ),
    isAddressableMessage        INTEGER GENERATED ALWAYS AS (
      type IS NULL
      OR
      type IN (
        'incoming',
        'outgoing'
      )
    )
);

CREATE TABLE callsHistory (
    callId          TEXT PRIMARY KEY,
    peerId          TEXT NOT NULL, -- conversation id (legacy) | uuid | groupId | roomId
    ringerId        TEXT DEFAULT NULL, -- ringer uuid
    mode            TEXT NOT NULL, -- enum "Direct" | "Group"
    type            TEXT NOT NULL, -- enum "Audio" | "Video" | "Group"
    direction       TEXT NOT NULL, -- enum "Incoming" | "Outgoing
    -- Direct: enum "Pending" | "Missed" | "Accepted" | "Deleted"
    -- Group: enum "GenericGroupCall" | "OutgoingRing" | "Ringing" | "Joined" | "Missed" | "Declined" | "Accepted" | "Deleted"
    status          TEXT NOT NULL,
    timestamp       INTEGER NOT NULL,
    startedById     TEXT DEFAULT NULL,
    endedTimestamp  INTEGER DEFAULT NULL,
    UNIQUE (callId, peerId) ON CONFLICT FAIL
);

CREATE TABLE items(
    id STRING PRIMARY KEY ASC,
    json TEXT
);

--
-- Users
--

INSERT INTO items VALUES('uuid_id','{"id":"uuid_id","value":"b22bb22b-b22b-b22b-b22b-b22bb22bb22b.2"}');

-- JSON is not used so it's omitted entirely for simplicity
INSERT INTO conversations VALUES('2dd22dd2-2dd2-2dd2-2dd2-2dd22dd22dd2',
  '', 1686497516529,'private',NULL,NULL,
  'Aaaaa','Aaaaaaaaaaa','Aaaaa Aaaaaaaaaaa','+998 91 1234567',
  'b22bb22b-b22b-b22b-b22b-b22bb22bb22b',NULL,1698005533710,2);
INSERT INTO conversations VALUES('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '', 1698005532850,'private',NULL,NULL,
  'Eeeee','Eeeeeeeeee','Eeeee Eeeeeeeeee','+7 999 333 44 55',
  '67766776-6776-6776-6776-677667766776',NULL,1698005575082,2);

--
-- Chats
--

-- Photo
INSERT INTO messages VALUES(698,'05fee241-7b89-461b-87be-14b62c5ed0e8',
        '{
          "timestamp": 1685967643288,
          "attachments": [
            {
              "blurHash": "LIJHgi00D%%hv{00JUW:_N%gD*xt",
              "contentType": "image/jpeg",
              "fileName": "my-photo.jpg",
              "path": "ph/photo-698",
              "size": 178803,
              "width": 150,
              "height": 100,
              "pending": false,
              "url": "does-not-matter",
              "thumbnail": {
                "path": "th/thumbnail-698",
                "contentType": "image/png",
                "width": 150,
                "height": 150,
                "version": 2,
                "plaintextHash": "b39e924de5e02a73949c5350d543f52551090b58654d3774344360c02a07f054",
                "size": 47889,
                "localKey": "enYEmTwiBuARJxNVDYf+Mxep/kIaziDDlip5SJ6c5wkFBTL8BPpBDFUoPuAvjrzQVJyFHkw5CQYsQakfkQJg6A=="
              },
              "digest": "eVmii8aNbEPL6ufh/eJzTov0hIKJtZaAFH8jA6whRSE=",
              "version": 2,
              "plaintextHash": "f6dac0c0cc7236dc7c73db60a614ce96f412bc7fdbeafd0f387441e13707382b",
              "localKey": "lszPR4/idmi6jRD9Cs2BLmQJE1XvG0pqfJqcqI4LmRqoUvWJIhiumjQ6A0UlNZp01r5KBy4379uksDB4tj36gA=="
            }
          ],
          "id": "05fee241-7b89-461b-87be-14b62c5ed0e8",
          "type": "outgoing",
          "body": "Photo caption",
          "conversationId": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          "contact": [],
          "preview": [],
          "sent_at": 1685967643288,
          "received_at": 1785,
          "received_at_ms": 1685967643288,
          "expirationStartTimestamp": 1685967645498,
          "readStatus": 0,
          "seenStatus": 0,
          "bodyRanges": [],
          "sendHQImages": false,
          "sendStateByConversationId": {
            "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee": {
              "status": "Read",
              "updatedAt": 1685967644053
            },
            "2dd22dd2-2dd2-2dd2-2dd2-2dd22dd22dd2": {
              "status": "Sent",
              "updatedAt": 1685967645821
            }
          },
          "schemaVersion": 13,
          "hasAttachments": 1,
          "hasVisualMediaAttachments": 1,
          "unidentifiedDeliveries": [
            "67766776-6776-6776-6776-677667766776"
          ],
          "errors": [],
          "synced": true
        }',
        0,NULL,1685967643288,13,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1785,NULL,1,0,1,NULL,1685967645498,
        'outgoing','Photo caption',NULL,NULL,NULL,0,0,
        NULL,NULL,NULL,NULL,0,0,NULL,0);

-- Call (outgoing, accepted)
INSERT INTO callsHistory VALUES('9921322926905153261',
        '67766776-6776-6776-6776-677667766776',NULL,'Direct','Audio','Outgoing','Accepted',1695224029560,NULL,NULL);
INSERT INTO messages VALUES(6385,'085e31c0-4ff1-4ce7-9db8-782eb6f724e3',
        '{
          "id": "085e31c0-4ff1-4ce7-9db8-782eb6f724e3",
          "conversationId": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          "type": "call-history",
          "sent_at": 1695224029560,
          "timestamp": 1695224029560,
          "received_at": 1694896272254,
          "received_at_ms": 1695224029560,
          "readStatus": 0,
          "seenStatus": 0,
          "callId": "9921322926905153261",
          "schemaVersion": 13,
          "attachments": [],
          "hasAttachments": 0,
          "contact": []
        }',
        0,NULL,1695224029560,13,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1694896272254,NULL,0,0,0,NULL,NULL,
        'call-history',NULL,NULL,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,0,NULL,0);

-- Audio
-- ($unknownFields omitted)
-- (file missing)
INSERT INTO messages VALUES(6486,'753105b3-70cf-4dd4-aa72-97310d31355a',
        '{
          "timestamp": 1695792334090,
          "attachments": [
            {
              "contentType": "audio/aac",
              "size": 24732,
              "digest": "9roPWR/u3iFXSgiCZpGnF+lnpZ7+beWZhRiuh8+rCDA=",
              "flags": 1,
              "uploadTimestamp": 1695792334890,
              "cdnNumber": 2,
              "cdnKey": "Nnwdhek2bf6WhN8clgI8",
              "$unknownFields": [
                {}
              ],
              "path": "au/audio-6486",
              "version": 2,
              "plaintextHash": "c635b5dabb3f99e34962e7adcf20c9b937f1727c302699dce04c7d0fcb2c438c",
              "localKey": "VFkLJUl971k34qQ1XNDOBVCfeoRBOZqqRf923fabEmPycyogqAy4xJEi8yZ+JTi8AZDBUlbG2Rym/vHuJkU6Xg=="
            }
          ],
          "id": "753105b3-70cf-4dd4-aa72-97310d31355a",
          "conversationId": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          "readStatus": 2,
          "received_at": 1694896272447,
          "received_at_ms": 1695795587746,
          "seenStatus": 2,
          "sent_at": 1695792334090,
          "serverGuid": "abd116b8-5bf7-4625-922e-34ce6274073e",
          "serverTimestamp": 1695792337069,
          "source": "+79993334455",
          "sourceDevice": 1,
          "sourceServiceId": "67766776-6776-6776-6776-677667766776",
          "type": "incoming",
          "unidentifiedDeliveryReceived": true,
          "schemaVersion": 13,
          "body": "",
          "bodyRanges": [],
          "contact": [],
          "decrypted_at": 1695795587847,
          "errors": [],
          "flags": 0,
          "hasAttachments": 1,
          "isViewOnce": false,
          "mentionsMe": false,
          "preview": [],
          "requiredProtocolVersion": 5,
          "supportedVersionAtReceive": 7,
          "readAt": 1695795590565
        }',
        2,NULL,1695792334090,13,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1694896272447,4915225359386,1,0,0,NULL,NULL,
        'incoming',NULL,NULL,NULL,NULL,0,0,'67766776-6776-6776-6776-677667766776','abd116b8-5bf7-4625-922e-34ce6274073e',1,NULL,0,2,NULL,0);

-- Video, x2
-- ($unknownFields omitted)
-- (first video and screenshot are both text-file-1.txt and second are text-file-2.txt)
INSERT INTO messages VALUES(6578,'9d3b3ffc-77da-43e4-8579-9526b2d953ea',
        '{
          "timestamp": 1696176322229,
          "attachments": [
            {
              "contentType": "video/mp4",
              "size": 2288136,
              "digest": "n/364VOLx1CXoLnX4deA2ycYoqfBUf9JVqem/H+eZ64=",
              "flags": 0,
              "width": 400,
              "height": 800,
              "blurHash": "LOHxHCE201%L~pNGxCR-5RNas.WB",
              "uploadTimestamp": 1696176311142,
              "cdnNumber": 2,
              "cdnKey": "ZNUejMf2G_sUTuoTzIsT",
              "$unknownFields": [{}],
              "path": "vi/vid-6578-1",
              "screenshot": {
                "contentType": "image/png",
                "path": "sc/screenshot-6578-1",
                "width": 400,
                "height": 800,
                "version": 2,
                "plaintextHash": "9265f24a4775c41867f7ea48cb9d5ff2be76e8ab6b4af7e1610acf8a57f12f2b",
                "size": 465122,
                "localKey": "58B7kS/1RbfrtbTUumxPSyd7C2o/CQy24xTDf7CBFC4uhUTxOrMVzlMsv/lY/2CJXeKxWziNmHKO3tub759zpw=="
              },
              "thumbnail": {
                "path": "th/thumbnail-6578-1",
                "contentType": "image/png",
                "width": 150,
                "height": 150,
                "version": 2,
                "plaintextHash": "32444d4efb04cffcb9e6c4a9c60f3d342a130deff67a25544b32dc9a1be9df11",
                "size": 40992,
                "localKey": "KhIAL2Bp3NUyqUASdi3o6+5uXa6Q1gsmY5YXdHdMtPnrEdfdLKeK63E5BWc5Vj35roHKJj3kmB3n8G7yN8aGSQ=="
              },
              "version": 2,
              "plaintextHash": "5c523b8306621ef2826d8124ddfcd0233c6adf696f27cea695f2ca385d3fd966",
              "localKey": "KQWrSeWhWBrVIIN6NaM/iWCTN4U8krC3qB221dG8YkSqXawIxupKCqgU6F8e71C5eYyZc/0hyd9ARmBCRdsxSQ=="
            },
            {
              "contentType": "video/mp4",
              "size": 895702,
              "digest": "N6LWwu73dfzai+lofRk8vzvhQpM8EEqGO35CGcML8vA=",
              "flags": 0,
              "width": 800,
              "height": 400,
              "blurHash": "LAHw.B%3140h1jMK^i-n.ms8IAxu",
              "uploadTimestamp": 1696176316564,
              "cdnNumber": 2,
              "cdnKey": "n36t1k0IINzSYU1YHCcn",
              "$unknownFields": [{}],
              "path": "vi/vid-6578-2",
              "screenshot": {
                "contentType": "image/png",
                "path": "sc/screenshot-6578-2",
                "width": 800,
                "height": 400,
                "version": 2,
                "plaintextHash": "92570b1e52d36aef6732595de5ad8b106858d999130b1fccfbca3372afdd754e",
                "size": 450402,
                "localKey": "uUSmTDNWFN1qBxAcv3rr7tkWMROCkf2nlP4mbO5OXPbMJHaVs0g9r/Vckru7xT16AtnS3bDLJuffUfcqdVujNg=="
              },
              "thumbnail": {
                "path": "th/thumbnail-6578-1",
                "contentType": "image/png",
                "width": 150,
                "height": 150,
                "version": 2,
                "plaintextHash": "30395f9ab7cbc9b7a3d79834bbc891edaf2566c313f2f64e1e37db555cd29b7c",
                "size": 44845,
                "localKey": "pfhVgtFqyml5ukKyu4kRjGB/e0ueZF9pbQHdeGm8YocxJhqYGl8TyuvUN4SK/w+eiqzXfWDBjY+i8QHF/ymyVQ=="
              },
              "version": 2,
              "plaintextHash": "8dc4e3260ceec552d4a9c2179e6427e5e0b309d83e93c61b766dfe9ae1c6c01d",
              "localKey": "Jea9V4mjYv7pkJ6IPpiGQEdMWqQJ09VGzoDI9MlE0zUICgQHrehkUP8m6hCDOYzoflgeT8XZdSFMmPx5z/EM2A=="
            }
          ],
          "id": "9d3b3ffc-77da-43e4-8579-9526b2d953ea",
          "conversationId": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          "readStatus": 0,
          "received_at": 1694896272648,
          "received_at_ms": 1696178469625,
          "seenStatus": 2,
          "sent_at": 1696176322229,
          "serverGuid": "ab744bdd-e5c2-4590-9147-3e724954ebc8",
          "serverTimestamp": 1696176328528,
          "source": "+79993334455",
          "sourceDevice": 1,
          "sourceServiceId": "67766776-6776-6776-6776-677667766776",
          "type": "incoming",
          "unidentifiedDeliveryReceived": true,
          "schemaVersion": 13,
          "body": "",
          "bodyRanges": [],
          "contact": [],
          "decrypted_at": 1696178470099,
          "errors": [],
          "flags": 0,
          "hasAttachments": 1,
          "hasVisualMediaAttachments": 1,
          "isViewOnce": false,
          "mentionsMe": false,
          "preview": [],
          "requiredProtocolVersion": 5,
          "supportedVersionAtReceive": 7
        }',
        0,NULL,1696176322229,13,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1694896272648,4915225359386,1,0,1,NULL,NULL,
        'incoming',NULL,NULL,NULL,NULL,0,0,
        '67766776-6776-6776-6776-677667766776','ab744bdd-e5c2-4590-9147-3e724954ebc8',1,NULL,0,2,NULL,0);

-- Edited message, no attachments
INSERT INTO messages
VALUES (6581,'1329d134-942c-4008-8723-8f040e8a46bc',
        '{
          "timestamp": 1696178282339,
          "attachments": [],
          "id": "1329d134-942c-4008-8723-8f040e8a46bc",
          "conversationId": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          "expirationStartTimestamp": 1696178282339,
          "readStatus": 0,
          "received_at_ms": 1696178469625,
          "received_at": 1694896272654,
          "seenStatus": 0,
          "sendStateByConversationId": {
            "2dd22dd2-2dd2-2dd2-2dd2-2dd22dd22dd2": {
              "status": "Sent",
              "updatedAt": 1696178282339
            },
            "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee": {
              "status": "Read",
              "updatedAt": 1696182036225
            }
          },
          "sent_at": 1696178282339,
          "serverTimestamp": 1696178282493,
          "source": "+998911234567",
          "sourceDevice": 1,
          "sourceServiceId": "b22bb22b-b22b-b22b-b22b-b22bb22bb22b",
          "type": "outgoing",
          "unidentifiedDeliveries": [
            "67766776-6776-6776-6776-677667766776"
          ],
          "schemaVersion": 13,
          "body": "Edited message, final version",
          "bodyRanges": [],
          "contact": [],
          "decrypted_at": 1696178470101,
          "errors": [],
          "flags": 0,
          "hasAttachments": 0,
          "isViewOnce": false,
          "mentionsMe": false,
          "preview": [],
          "requiredProtocolVersion": 0,
          "supportedVersionAtReceive": 7,
          "editHistory": [
            {
              "attachments": [],
              "body": "Edited message, final version",
              "bodyRanges": [],
              "preview": [],
              "sendStateByConversationId": {
                "2dd22dd2-2dd2-2dd2-2dd2-2dd22dd22dd2": {
                  "status": "Sent",
                  "updatedAt": 1696178321462
                },
                "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee": {
                  "status": "Read",
                  "updatedAt": 1696182036225
                }
              },
              "timestamp": 1696178321462
            },
            {
              "attachments": [],
              "body": "Edited message, initial version",
              "bodyRanges": [],
              "preview": [],
              "sendStateByConversationId": {
                "2dd22dd2-2dd2-2dd2-2dd2-2dd22dd22dd2": {
                  "status": "Sent",
                  "updatedAt": 1696178282339
                },
                "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee": {
                  "status": "Delivered",
                  "updatedAt": 1696178280842
                }
              },
              "timestamp": 1696178282339
            }
          ],
          "editMessageTimestamp": 1696178321462
        }',
        0,NULL,1696178282339,13,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1694896272654,998915209824,0,0,0,NULL,1696178282339,
        'outgoing','Edited message, final version',NULL,NULL,NULL,0,0,
        'b22bb22b-b22b-b22b-b22b-b22bb22bb22b',NULL,1,NULL,0,0,NULL,0);
