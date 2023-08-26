package org.fs.chm.dao

import java.io.{File => JFile}

import com.github.nscala_time.time.Imports._
import org.fs.chm.dao.Entities._
import org.fs.chm.protobuf.Chat
import org.fs.chm.protobuf.Dataset
import org.fs.chm.protobuf.Message
import org.fs.chm.protobuf.PbUuid
import org.fs.chm.protobuf.User
import org.fs.chm.utility.LangUtils._

/**
 * Everything except for messages should be pre-cached and readily available.
 * Should support equality.
 */
trait ChatHistoryDao extends AutoCloseable {
  sys.addShutdownHook(close())

  /** User-friendly name of a loaded data */
  def name: String

  def datasets: Seq[Dataset]

  /** Directory which stores eveything in the dataset. All files are guaranteed to have this as a prefix */
  def datasetRoot(dsUuid: PbUuid): DatasetRoot

  /** List all files referenced by entities of this dataset. Some might not exist. */
  def datasetFiles(dsUuid: PbUuid): Set[JFile]

  def myself(dsUuid: PbUuid): User

  /** Contains myself as the first element. Order must be stable. Method is expected to be fast. */
  def users(dsUuid: PbUuid): Seq[User]

  def userOption(dsUuid: PbUuid, id: Long): Option[User]

  def chats(dsUuid: PbUuid): Seq[ChatWithDetails]

  def chatOption(dsUuid: PbUuid, id: Long): Option[ChatWithDetails]

  /** Return N messages after skipping first M of them. Trivial pagination in a nutshell. */
  def scrollMessages(chat: Chat, offset: Int, limit: Int): IndexedSeq[Message]

  def firstMessages(chat: Chat, limit: Int): IndexedSeq[Message] =
    scrollMessages(chat, 0, limit)

  def lastMessages(chat: Chat, limit: Int): IndexedSeq[Message]

  /**
   * Return N messages before the given one (inclusive).
   * Message must be present, so the result would contain at least one element.
   */
  final def messagesBefore(chat: Chat, msg: Message, limit: Int): IndexedSeq[Message] =
    messagesBeforeImpl(chat, msg, limit) ensuring (seq => seq.nonEmpty && seq.size <= limit &&
      seq.last.sourceIdOption == msg.sourceIdOption && seq.last.internalId == msg.internalId)

  protected def messagesBeforeImpl(chat: Chat, msg: Message, limit: Int): IndexedSeq[Message]

  /**
   * Return N messages after the given one (inclusive).
   * Message must be present, so the result would contain at least one element.
   */
  final def messagesAfter(chat: Chat, msg: Message, limit: Int): IndexedSeq[Message] =
    messagesAfterImpl(chat, msg, limit) ensuring (seq => seq.nonEmpty && seq.size <= limit &&
      seq.head.sourceIdOption == msg.sourceIdOption && seq.head.internalId == msg.internalId)

  protected def messagesAfterImpl(chat: Chat, msg: Message, limit: Int): IndexedSeq[Message]

  /**
   * Return N messages between the given ones (inclusive).
   * Messages must be present, so the result would contain at least one element (if both are the same message).
   */
  final def messagesBetween(chat: Chat, msg1: Message, msg2: Message): IndexedSeq[Message] =
    messagesBetweenImpl(chat, msg1, msg2) ensuring (seq => seq.nonEmpty &&
      seq.head.sourceIdOption == msg1.sourceIdOption && seq.head.internalId == msg1.internalId &&
      seq.last.sourceIdOption == msg2.sourceIdOption && seq.last.internalId == msg2.internalId)

  protected def messagesBetweenImpl(chat: Chat, msg1: Message, msg2: Message): IndexedSeq[Message]

  /**
   * Count messages between the given ones (exclusive, unlike messagesBetween).
   * Messages must be present.
   */
  def countMessagesBetween(chat: Chat, msg1: Message, msg2: Message): Int

  /** Returns N messages before and N at-or-after the given date */
  def messagesAroundDate(chat: Chat, date: DateTime, limit: Int): (IndexedSeq[Message], IndexedSeq[Message])

  def messageOption(chat: Chat, source_id: MessageSourceId): Option[Message]

  def messageOptionByInternalId(chat: Chat, internal_id: MessageInternalId): Option[Message]

  def isMutable: Boolean = this.isInstanceOf[MutableChatHistoryDao]

  override def close(): Unit = {}

  /** Whether given data path is the one loaded in this DAO */
  def isLoaded(dataPathRoot: JFile): Boolean
}

trait MutableChatHistoryDao extends ChatHistoryDao {
  def insertDataset(ds: Dataset): Unit

  def renameDataset(dsUuid: PbUuid, newName: String): Dataset

  def deleteDataset(dsUuid: PbUuid): Unit

  /** Shift time of all timestamps in the dataset to accommodate timezone differences */
  def shiftDatasetTime(dsUuid: PbUuid, hrs: Int): Unit

  /** Insert a new user. It should not yet exist */
  def insertUser(user: User, isMyself: Boolean): Unit

  /** Sets the data (names and phone only) for a user with the given `id` and `dsUuid` to the given state */
  def updateUser(user: User): Unit

  /**
   * Merge absorbed user into base user, replacing base user's names and phone.
   * Their personal chats will also be merged into one (named after the "new" user).
   */
  def mergeUsers(baseUser: User, absorbedUser: User): Unit

  /**
   * Insert a new chat.
   * It should have a proper DS UUID set, should not yet exist, and all users must already be inserted.
   * Content will be resolved based on the given dataset root and copied accordingly.
   */
  def insertChat(srcDsRoot: JFile, chat: Chat): Unit

  def deleteChat(chat: Chat): Unit

  /**
   * Insert a new message for the given chat.
   * Internal ID will be ignored.
   * Content will be resolved based on the given dataset root and copied accordingly.
   */
  def insertMessages(srcDsRoot: JFile, chat: Chat, msgs: Seq[Message]): Unit

  /** Don't do automatic backups on data changes until re-enabled */
  def disableBackups(): Unit

  /** Start doing backups automatically once again */
  def enableBackups(): Unit

  /** Create a backup, if enabled, otherwise do nothing */
  def backup(): Unit
}
