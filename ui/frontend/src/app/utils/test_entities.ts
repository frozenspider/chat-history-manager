'use client'

import { Chat, ChatType, Dataset, Message, SourceType, User } from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { CombinedChat, GetUserPrettyName } from "@/app/utils/entity_utils";
import { LoadedFileState } from "@/app/utils/state";
import { ChatState } from "@/app/utils/chat_state";
import { CreateMapFromKeys } from "@/app/utils/utils";

export const TestDataset: Dataset = {
  uuid: { value: "00000000-0000-0000-0000-000000000000" },
  alias: "Test Dataset",
};

const TestUsers: User[] = (() => {
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
})()

export const TestUsersMap: Map<bigint, User> = (() => {
  let users = new Map<bigint, User>();
  TestUsers.forEach((user) => {
    users.set(user.id, user);
  });
  return users;
})()

const TestCwds: ChatWithDetailsPB[] = (() => {
  let chats: Chat[] = [
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(1),
      nameOption: "Everyone",
      sourceType: SourceType.TELEGRAM,
      tpe: ChatType.PRIVATE_GROUP,
      memberIds: TestUsers.map((u) => u.id),
      msgCount: 10,
      mainChatId: undefined
    },
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(2),
      nameOption: "John Doe chat one",
      sourceType: SourceType.TELEGRAM,
      tpe: ChatType.PERSONAL,
      memberIds: [TestUsers[0].id, TestUsers[1].id],
      msgCount: 321,
      mainChatId: undefined
    },
    {
      dsUuid: TestDataset.uuid,
      id: BigInt(3),
      nameOption: "John Doe chat two",
      sourceType: SourceType.TELEGRAM,
      tpe: ChatType.PERSONAL,
      memberIds: [TestUsers[0].id, TestUsers[1].id],
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
      memberIds: [TestUsers[0].id, TestUsers[1].id],
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
    members: TestUsers.filter((u) => chat.memberIds.includes(u.id))
  }))
})()

export const TestMessages: Message[] = (() => {
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

    //
    // Different kinds of content
    //

    Message.fromJSON({
      internalId: 1000,
      sourceIdOption: 1000,
      timestamp: 1699001000,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          sticker: {
            pathOption: "/path/to/sticker",
            width: 100,
            height: 70,
            thumbnailPathOption: "/path/to/thumbnail",
            emojiOption: "😀",
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1010,
      sourceIdOption: 1010,
      timestamp: 1699001010,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          photo: {
            pathOption: "/path/to/photo",
            width: 100,
            height: 70,
            isOneTime: false,
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1020,
      sourceIdOption: 1020,
      timestamp: 1699001020,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          voiceMsg: {
            pathOption: "/path/to/audio",
            mimeType: "audio/mpeg",
            durationSecOption: 123,
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1021,
      sourceIdOption: 1021,
      timestamp: 1699001021,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          voiceMsg: {
            mimeType: "audio/mpeg",
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1030,
      sourceIdOption: 1030,
      timestamp: 1699001030,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          audio: {
            pathOption: "/path/to/audio",
            titleOption: "Title",
            performerOption: "Performer",
            mimeType: "audio/mpeg",
            durationSecOption: 123,
            thumbnailPathOption: "/path/to/thumbnail",
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1031,
      sourceIdOption: 1031,
      timestamp: 1699001031,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          audio: {
            performerOption: "Performer",
            mimeType: "audio/mpeg",
            durationSecOption: 123,
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1032,
      sourceIdOption: 1032,
      timestamp: 1699001032,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          audio: {
            titleOption: "Title",
            mimeType: "audio/mpeg",
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1040,
      sourceIdOption: 1040,
      timestamp: 1699001040,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          videoMsg: {
            pathOption: "/path/to/video",
            width: 100,
            height: 70,
            mimeType: "video/mp4",
            durationSecOption: 123,
            thumbnailPathOption: "/path/to/thumbnail",
            isOneTime: false,
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1041,
      sourceIdOption: 1041,
      timestamp: 1699001041,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          videoMsg: {
            width: 100,
            height: 70,
            mimeType: "video/mp4",
            isOneTime: false,
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1050,
      sourceIdOption: 1050,
      timestamp: 1699001050,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          video: {
            pathOption: "/path/to/video",
            titleOption: "Title",
            performerOption: "Performer",
            width: 100,
            height: 70,
            mimeType: "video/mp4",
            durationSecOption: 123,
            thumbnailPathOption: "/path/to/thumbnail",
            isOneTime: true,
          },
        },
      }
    }),


    Message.fromJSON({
      internalId: 1051,
      sourceIdOption: 1051,
      timestamp: 1699001051,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          video: {
            width: 100,
            height: 70,
            mimeType: "video/mp4",
            isOneTime: false,
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1060,
      sourceIdOption: 1060,
      timestamp: 1699001060,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          file: {
            pathOption: "/path/to/file.pdf",
            fileNameOption: "File Name",
            mimeTypeOption: "application/pdf",
            thumbnailPathOption: "/path/to/thumbnail",
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1061,
      sourceIdOption: 1061,
      timestamp: 1699001061,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          file: {
            pathOption: "/path/to/file.pdf",
            fileNameOption: "File Name",
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1062,
      sourceIdOption: 1062,
      timestamp: 1699001062,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          file: {},
        },
      }
    }),

    Message.fromJSON({
      internalId: 1070,
      sourceIdOption: 1070,
      timestamp: 1699001070,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          location: {
            titleOption: "Location Title",
            addressOption: "123 Main St",
            latStr: "37.7749",
            lonStr: "-122.4194",
            durationSecOption: 123,
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1071,
      sourceIdOption: 1071,
      timestamp: 1699001071,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          location: {
            latStr: "37.7749",
            lonStr: "-122.4194",
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1080,
      sourceIdOption: 1080,
      timestamp: 1699001080,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          poll: { question: "What's your favorite color?", },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1090,
      sourceIdOption: 1090,
      timestamp: 1699001090,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          sharedContact: {
            firstNameOption: "New",
            lastNameOption: "Name",
            phoneNumberOption: "+0 (00) 000-00-00",
            vcardPathOption: "/path/to/vcard",
          },
        },
      }
    }),

    Message.fromJSON({
      internalId: 1091,
      sourceIdOption: 1091,
      timestamp: 1699001091,
      fromId: 2,
      text: [],
      searchableString: "",
      regular: {
        contentOption: {
          sharedContact: {
            firstNameOption: TestUsers[1].firstNameOption,
            lastNameOption: TestUsers[1].lastNameOption,
            phoneNumberOption: TestUsers[1].phoneNumberOption,
          },
        },
      }
    }),

    //
    // Service messages
    //

    // MessageServicePhoneCall

    Message.fromJSON({
      internalId: 2000,
      sourceIdOption: 2000,
      timestamp: 1699002001,
      fromId: 7,
      text: [],
      searchableString: "",
      service: {
        phoneCall: {
          durationSecOption: 12345,
          discardReasonOption: "hangup",
          members: [GetUserPrettyName(TestUsers[1]), GetUserPrettyName(TestUsers[2]), GetUserPrettyName(TestUsers[3])]
        }
      }
    }),

    // MessageServiceSuggestProfilePhoto

    Message.fromJSON({
      internalId: 2010,
      sourceIdOption: 2010,
      timestamp: 1699002010,
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
      internalId: 2020,
      sourceIdOption: 2020,
      timestamp: 1699002020,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        pinMessage: { messageSourceId: 2010 }
      }
    }),

    // MessageServiceClearHistory

    Message.fromJSON({
      internalId: 2030,
      sourceIdOption: 2030,
      timestamp: 1699002030,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        clearHistory: {}
      }
    }),

    // MessageServiceBlockUser

    Message.fromJSON({
      internalId: 2040,
      sourceIdOption: 2040,
      timestamp: 1699002040,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        blockUser: { isBlocked: true }
      }
    }),
    Message.fromJSON({
      internalId: 2041,
      sourceIdOption: 2041,
      timestamp: 1699002041,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        blockUser: { isBlocked: false }
      }
    }),

    // MessageServiceStatusTextChanged

    Message.fromJSON({
      internalId: 2050,
      sourceIdOption: 2050,
      timestamp: 1699002050,
      fromId: 1,
      text: [{ plain: { text: "I'm busy!" } }],
      searchableString: "",
      service: {
        statusTextChanged: {}
      }
    }),

    // MessageServiceNotice

    Message.fromJSON({
      internalId: 2060,
      sourceIdOption: 2060,
      timestamp: 1699002060,
      fromId: 1,
      text: [{ plain: { text: "This is a notice." } }],
      searchableString: "",
      service: {
        notice: {}
      }
    }),

    // MessageServiceGroupCreate

    Message.fromJSON({
      internalId: 2070,
      sourceIdOption: 2070,
      timestamp: 1699002070,
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
      internalId: 2071,
      sourceIdOption: 2071,
      timestamp: 1699002071,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupCreate: {
          title: "Group name",
          members: [GetUserPrettyName(TestUsers[1]), GetUserPrettyName(TestUsers[2])]
        }
      }
    }),

    // MessageServiceGroupEditTitle

    Message.fromJSON({
      internalId: 2080,
      sourceIdOption: 2080,
      timestamp: 1699002080,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupEditTitle: { title: "New title" }
      }
    }),

    // MessageServiceGroupEditPhoto

    Message.fromJSON({
      internalId: 2090,
      sourceIdOption: 2090,
      timestamp: 1699002090,
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
      internalId: 2100,
      sourceIdOption: 2100,
      timestamp: 1699002100,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupDeletePhoto: {}
      }
    }),

    // MessageServiceGroupInviteMembers

    Message.fromJSON({
      internalId: 2120,
      sourceIdOption: 2120,
      timestamp: 1699002120,
      fromId: 5,
      text: [],
      searchableString: "",
      service: {
        groupInviteMembers: {
          members: [GetUserPrettyName(TestUsers[4])]
        }
      }
    }),
    Message.fromJSON({
      internalId: 2121,
      sourceIdOption: 2121,
      timestamp: 1699002121,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupInviteMembers: {
          members: [GetUserPrettyName(TestUsers[1])]
        }
      }
    }),
    Message.fromJSON({
      internalId: 2122,
      sourceIdOption: 2122,
      timestamp: 1699002122,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupInviteMembers: {
          members: [GetUserPrettyName(TestUsers[1]), GetUserPrettyName(TestUsers[2])]
        }
      }
    }),

    // MessageServiceGroupRemoveMembers

    Message.fromJSON({
      internalId: 2130,
      sourceIdOption: 2130,
      timestamp: 1699002130,
      fromId: 5,
      text: [],
      searchableString: "",
      service: {
        groupRemoveMembers: {
          members: [GetUserPrettyName(TestUsers[4])]
        }
      }
    }),
    Message.fromJSON({
      internalId: 2131,
      sourceIdOption: 2131,
      timestamp: 1699002131,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupRemoveMembers: {
          members: [GetUserPrettyName(TestUsers[1])]
        }
      }
    }),
    Message.fromJSON({
      internalId: 2132,
      sourceIdOption: 2132,
      timestamp: 1699002132,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupRemoveMembers: {
          members: [GetUserPrettyName(TestUsers[1]), GetUserPrettyName(TestUsers[2])]
        }
      }
    }),

    // MessageServiceGroupMigrateFrom

    Message.fromJSON({
      internalId: 2140,
      sourceIdOption: 2140,
      timestamp: 1699002140,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupMigrateFrom: { title: "My old group" }
      }
    }),

    // MessageServiceGroupMigrateTo

    Message.fromJSON({
      internalId: 2150,
      sourceIdOption: 2150,
      timestamp: 1699002150,
      fromId: 1,
      text: [],
      searchableString: "",
      service: {
        groupMigrateTo: {}
      }
    }),
  ]
})()

export const TestLoadedFiles: LoadedFileState[] = [{
  key: "<no-file>",
  name: "<no-name>",
  datasets: [
    {
      fileKey: "<no-file>",
      ds: TestDataset,
      dsRoot: ".",
      users: TestUsersMap,
      myselfId: BigInt(1),
      cwds: TestCwds
    },
  ],
}]

export const TestChatState: ChatState = new ChatState(
  new CombinedChat(TestCwds[0], []),
  TestLoadedFiles[0].datasets[0],
  {
    chatMessages: TestMessages.map(m => [TestCwds[0].chat!, m]),
    scrollHeight: 0,
    scrollTop: Number.MAX_SAFE_INTEGER / 2,
    lastScrollDirectionUp: false
  },
  CreateMapFromKeys([TestCwds[0].chat!.id], _ => ({
    $case: "loaded",

    lowestInternalId: TestMessages[0].internalId,
    highestInternalId: TestMessages[TestMessages.length - 1].internalId,

    beginReached: true,
    endReached: true
  })),
  CreateMapFromKeys([TestCwds[0].chat!.id], _ => new Map())
)

/** 250 ms of silence MP3 file taken from https://github.com/anars/blank-audio */
export const TestMp3Base64Data = "data:audio/mpeg;base64," +
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
