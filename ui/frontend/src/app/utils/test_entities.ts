'use client'

import { Chat, ChatType, Dataset, Message, SourceType, User } from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { GetUserPrettyName } from "@/app/utils/entity_utils";
import { ChatState, LoadedFileState } from "@/app/utils/state";

export const TestDataset: Dataset = {
  uuid: { value: "00000000-0000-0000-0000-000000000000" },
  alias: "Test Dataset",
};

export function TestUsers(): User[] {
  return [
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(1),
      firstNameOption: "Myself",
      lastNameOption: undefined,
      usernameOption: undefined,
      phoneNumberOption: undefined
    },
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(2),
      firstNameOption: "John",
      lastNameOption: "Doe",
      usernameOption: "jdoe",
      phoneNumberOption: undefined
    },
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(3),
      firstNameOption: "Jane",
      lastNameOption: "Smith",
      usernameOption: undefined,
      phoneNumberOption: "+0 (00) 000-00-00"
    },
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(4),
      firstNameOption: "Single First Name",
      lastNameOption: undefined,
      usernameOption: undefined,
      phoneNumberOption: undefined
    },
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(5),
      firstNameOption: undefined,
      lastNameOption: undefined,
      usernameOption: "username",
      phoneNumberOption: undefined
    },
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(6),
      firstNameOption: undefined,
      lastNameOption: undefined,
      usernameOption: undefined,
      phoneNumberOption: "+1 (23) 456-78-90"
    }
  ];
}

export function TestUsersMap(): Map<bigint, User> {
  let users = new Map<bigint, User>();
  TestUsers().forEach((user) => {
    users.set(user.id, user);
  });
  return users;
}

export function TestCwds(): ChatWithDetailsPB[] {
  let testUsers = TestUsers();
  let chats: Chat[] = [
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(1),
      nameOption: "Everyone",
      sourceType: SourceType.TELEGRAM,
      tpe: ChatType.PRIVATE_GROUP,
      memberIds: testUsers.map((u) => u.id),
      msgCount: 10,
      mainChatId: undefined
    },
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(2),
      nameOption: "John Doe chat one",
      sourceType: SourceType.TELEGRAM,
      tpe: ChatType.PERSONAL,
      memberIds: [testUsers[0].id, testUsers[1].id],
      msgCount: 321,
      mainChatId: undefined
    },
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(3),
      nameOption: "John Doe chat two",
      sourceType: SourceType.TELEGRAM,
      tpe: ChatType.PERSONAL,
      memberIds: [testUsers[0].id, testUsers[1].id],
      msgCount: 321,
      mainChatId: BigInt(2),
    },
  ];
  for (let i = Number(chats[chats.length - 1].id) + 1; i < 100; i++) {
    chats.push({
      dsUuid: TestDataset.uuid,
      id: BigInt(i),
      nameOption: "Chat " + i,
      sourceType: SourceType.TELEGRAM,
      tpe: ChatType.PERSONAL,
      memberIds: [testUsers[0].id, testUsers[1].id],
      msgCount: 100 + i,
      mainChatId: undefined
    });
  }

  return chats.map((chat) => ({
    chat: chat,
    lastMsgOption: Message.fromJSON({
      fromId: chat.memberIds[1],
      searchableString: "Hey there! How can I help you?",
      regular: {}
    }),
    members: testUsers.filter((u) => chat.memberIds.includes(u.id))
  }))
}

export function TestMessages(): Message[] {
  let users = TestUsers()
  return [
    Message.fromJSON({
      internalId: 1,
      sourceIdOption: 1,
      timestamp: 1698901234,
      fromId: 2,
      text: [
        { plain: { text: "Demo of different content types:" } },
        { plain: { text: "  plain   " } },
        { bold: { text: "  bold   " } },
        { italic: { text: "  italic   " } },
        { underline: { text: "  underline   " } },
        { strikethrough: { text: "  strikethrough   " } },
        { link: { href: "https://www.google.com/", textOption: "   My    link  " } },
        { link: { href: "https://www.amazon.com/", textOption: "My hidden link 1", hidden: "1" } },
        { link: { href: "https://www.amazon.com/", textOption: "My hidden link 1 again", hidden: "1" } },
        { link: { href: "https://www.rust-lang.org/", textOption: "My hidden link 2", hidden: "1" } },
        { spoiler: { text: "   spoiler  " } },
        { prefmtInline: { text: "inline code   block" } },
        { prefmtBlock: { text: "prefmt   code block" } },
        { blockquote: { text: "block    quote   " } }
      ],
      searchableString: "Search me!",
      regular: {
        editTimestampOption: 1708901234,
        isDeleted: true,
        forwardFromNameOption: "Jane Smith",
        replyToMessageIdOption: 4313483375,
        contentOption: {
          photo: {
            pathOption: "my/file/path",
            width: 400,
            height: 100,
            isOneTime: false
          }
        }
      }
    }),
    Message.fromJSON({
      internalId: 2,
      sourceIdOption: 2,
      timestamp: 1698901235,
      fromId: 1,
      text: [
        { searchableString: "Hey there! How can I help you?", plain: { text: "Hey there! How can I help you?" } }
      ],
      searchableString: "Hey there! How can I help you?",
      regular: {}
    }),
    Message.fromJSON({
      internalId: 3,
      sourceIdOption: 3,
      timestamp: 1698902000,
      fromId: 3,
      text: [
        { searchableString: "", plain: { text: "I'm having trouble with my account" } }
      ],
      searchableString: "",
      regular: {}
    }),
    Message.fromJSON({
      internalId: 4,
      sourceIdOption: 4,
      timestamp: 1698902060,
      fromId: 4,
      text: [
        { searchableString: "", plain: { text: "Here's a photo of the error message I'm getting." } }
      ],
      searchableString: "",
      regular: {
        replyToMessageIdOption: 3,
        contentOption: {
          photo: {
            pathOption: "my/file/path",
            width: 200,
            height: 200,
            isOneTime: false
          }
        }
      }
    }),
    Message.fromJSON({
      internalId: 5,
      sourceIdOption: 5,
      timestamp: 1698902121,
      fromId: 6,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          sharedContact: {
            firstNameOption: users[1].firstNameOption,
            lastNameOption: users[1].lastNameOption,
            phoneNumberOption: users[1].phoneNumberOption,
          }
        }
      }
    }),
    Message.fromJSON({
      internalId: 6,
      sourceIdOption: 6,
      timestamp: 1698902123,
      fromId: 1,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          voiceMsg: {
            pathOption: "does-not-matter",
            mimeType: "audio/mp3"
          }
        }
      }
    }),

    //
    // Service messages
    //

    // MessageServicePhoneCall

    Message.fromJSON({
      internalId: 1000,
      sourceIdOption: 1000,
      timestamp: 1699001001,
      fromId: 7,
      text: [],
      searchableString: "",
      service: {
        phoneCall: {
          durationSecOption: 12345,
          discardReasonOption: "hangup",
          members: [GetUserPrettyName(users[1]), GetUserPrettyName(users[2]), GetUserPrettyName(users[3])]
        }
      }
    }),

    // MessageServiceSuggestProfilePhoto

    Message.fromJSON({
      internalId: 1010,
      sourceIdOption: 1010,
      timestamp: 1699001010,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        suggestProfilePhoto: {
          photo: {
            pathOption: "my/file/path",
            width: 200,
            height: 200,
            isOneTime: false
          }
        }
      }
    }),

    // MessageServicePinMessage

    Message.fromJSON({
      internalId: 1020,
      sourceIdOption: 1020,
      timestamp: 1699001020,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        pinMessage: { messageSourceId: 1010 }
      }
    }),

    // MessageServiceClearHistory

    Message.fromJSON({
      internalId: 1030,
      sourceIdOption: 1030,
      timestamp: 1699001030,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        clearHistory: {}
      }
    }),

    // MessageServiceBlockUser

    Message.fromJSON({
      internalId: 1040,
      sourceIdOption: 1040,
      timestamp: 1699001040,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        blockUser: { isBlocked: true }
      }
    }),
    Message.fromJSON({
      internalId: 1041,
      sourceIdOption: 1041,
      timestamp: 1699001041,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        blockUser: { isBlocked: false }
      }
    }),

    // MessageServiceStatusTextChanged

    Message.fromJSON({
      internalId: 1050,
      sourceIdOption: 1050,
      timestamp: 1699001050,
      fromId: 1,
      text: [{ plain: { text: "I'm busy!" } }],
      searchableString: "",
      service: {
        statusTextChanged: {}
      }
    }),

    // MessageServiceNotice

    Message.fromJSON({
      internalId: 1060,
      sourceIdOption: 1060,
      timestamp: 1699001060,
      fromId: 1,
      text: [{ plain: { text: "This is a notice." } }],
      searchableString: "",
      service: {
        notice: {}
      }
    }),

    // MessageServiceGroupCreate

    Message.fromJSON({
      internalId: 1070,
      sourceIdOption: 1070,
      timestamp: 1699001070,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupCreate: {
          title: "Group name",
          members: []
        }
      }
    }),
    Message.fromJSON({
      internalId: 1071,
      sourceIdOption: 1071,
      timestamp: 1699001071,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupCreate: {
          title: "Group name",
          members: [GetUserPrettyName(users[1]), GetUserPrettyName(users[2])]
        }
      }
    }),

    // MessageServiceGroupEditTitle

    Message.fromJSON({
      internalId: 1080,
      sourceIdOption: 1080,
      timestamp: 1699001080,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupEditTitle: { title: "New title" }
      }
    }),

    // MessageServiceGroupEditPhoto

    Message.fromJSON({
      internalId: 1090,
      sourceIdOption: 1090,
      timestamp: 1699001090,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupEditPhoto: {
          photo: {
            pathOption: "my/file/path",
            width: 200,
            height: 200,
            isOneTime: false
          }
        }
      }
    }),

    // MessageServiceGroupDeletePhoto

    Message.fromJSON({
      internalId: 1100,
      sourceIdOption: 1100,
      timestamp: 1699001100,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupDeletePhoto: {}
      }
    }),

    // MessageServiceGroupInviteMembers

    Message.fromJSON({
      internalId: 1120,
      sourceIdOption: 1120,
      timestamp: 1699001120,
      fromId: 5,
      text: [],
      searchableString: "",
      service: {
        groupInviteMembers: {
          members: [GetUserPrettyName(users[4])]
        }
      }
    }),
    Message.fromJSON({
      internalId: 1121,
      sourceIdOption: 1121,
      timestamp: 1699001121,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupInviteMembers: {
          members: [GetUserPrettyName(users[1])]
        }
      }
    }),
    Message.fromJSON({
      internalId: 1122,
      sourceIdOption: 1122,
      timestamp: 1699001122,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupInviteMembers: {
          members: [GetUserPrettyName(users[1]), GetUserPrettyName(users[2])]
        }
      }
    }),

    // MessageServiceGroupRemoveMembers

    Message.fromJSON({
      internalId: 1130,
      sourceIdOption: 1130,
      timestamp: 1699001130,
      fromId: 5,
      text: [],
      searchableString: "",
      service: {
        groupRemoveMembers: {
          members: [GetUserPrettyName(users[4])]
        }
      }
    }),
    Message.fromJSON({
      internalId: 1131,
      sourceIdOption: 1131,
      timestamp: 1699001131,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupRemoveMembers: {
          members: [GetUserPrettyName(users[1])]
        }
      }
    }),
    Message.fromJSON({
      internalId: 1132,
      sourceIdOption: 1132,
      timestamp: 1699001132,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupRemoveMembers: {
          members: [GetUserPrettyName(users[1]), GetUserPrettyName(users[2])]
        }
      }
    }),

    // MessageServiceGroupMigrateFrom

    Message.fromJSON({
      internalId: 1140,
      sourceIdOption: 1140,
      timestamp: 1699001140,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupMigrateFrom: { title: "My old group" }
      }
    }),

    // MessageServiceGroupMigrateTo

    Message.fromJSON({
      internalId: 1150,
      sourceIdOption: 1150,
      timestamp: 1699001150,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupMigrateTo: {}
      }
    }),

  ]
}

export const TestLoadedFiles: LoadedFileState[] = [{
  key: "<no-file>",
  name: "<no-name>",
  datasets: [
    {
      fileKey: "<no-file>",
      ds: TestDataset,
      dsRoot: ".",
      users: TestUsersMap(),
      myselfId: BigInt(1),
      cwds: TestCwds()
    },
  ],
}]

export const TestChatState: ChatState = {
  cwd: TestLoadedFiles[0].datasets[0].cwds[0],
  dsState: TestLoadedFiles[0].datasets[0],
  viewState: {
    messages: TestMessages(),
    beginReached: true,
    endReached: true,
    scrollHeight: 0,
    scrollTop: Number.MAX_SAFE_INTEGER,
    lastScrollDirectionUp: false
  },
  resolvedMessages: new Map()
}

/** 250 ms of silence MP3 file taken from https://github.com/anars/blank-audio */
export const TestMp3Base64Data = "data:audio/mp3;base64," +
  "SUQzAwAAAAAAWFRBTEIAAAAMAAAAQmxhbmsgQXVkaW9USVQyAAAAHAAAADI1MCBN" +
  "aWxsaXNlY29uZHMgb2YgU2lsZW5jZVRQRTEAAAASAAAAQW5hciBTb2Z0d2FyZSBM" +
  "TEP/4xjEAAkzUfwIAE1NDwAzHwL+Y8gLIC/G5v+BEBSX///8bmN4Bjze/xjEAAg0" +
  "ECEGaR+v///P////////+tk5/CLN2hyWE+D/4xjEFgkLZiQIAEdKDgZi0BBxxIIx" +
  "YGALaBuq/+1/BSrxfylOzt5F7v///79f6+yGfIjsRzncM7CHmHFJcpIsUAi2Kh19" +
  "f/7/4xjELAnTXhgAAEUt309f//////qq8zIhdkYopjjygKIZxYwnDwysg5EpI5HS" +
  "YAJAlQ4f+an//D0ImhEa//////l6k4mYZCH/4xjEPwobYiQIAI1PMRo2HCoKhrRJ" +
  "MFEhYMof//8yL//MjP+Rf/+Z/5f/zVpZ9lkMjJlDBQYR1VUVP9pEVUxBTUUzLjk4" +
  "LjL/4xjEUQjbVhgIAEdNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV" +
  "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/4xjEaAiLJawIAEdJVVVVVVVVVVVV" +
  "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV" +
  "VVX/4xjEgAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV" +
  "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU="
