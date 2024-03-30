import { Chat, ChatType, Dataset, Message, SourceType, User } from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { GetUserPrettyName } from "@/app/utils/entity_utils";

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
      msgCount: 0, // FIXME
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
      fromId: 1,
      text: [
        { searchableString: "Hey there! How can I help you?", plain: { text: "Hey there! How can I help you?" } }
      ],
      searchableString: "Hey there! How can I help you?",
      regular: {}
    }),
    Message.fromJSON({
      internalId: 2,
      sourceIdOption: 2,
      timestamp: 1698901235,
      fromId: 2,
      text: [
        { searchableString: "", plain: { text: "Demo of different content types: " } },
        { searchableString: "", spoiler: { text: "Spoiler" } },
        { searchableString: "", prefmtBlock: { text: "Prefmt code block" } },
        { searchableString: "", prefmtInline: { text: "Inline code block" } },
        { searchableString: "", link: { href: "https://www.google.com/", textOption: "My link" } }
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
      timestamp: 1698902120,
      fromId: 5,
      text: [],
      searchableString: "",
      service: {
        groupInviteMembers: {
          members: [GetUserPrettyName(users[5])]
        }
      }
    }),
  ]
}
