package org.fs.chm.loader.telegram

import java.io.File
import java.io.FileNotFoundException
import java.util.UUID

import scala.collection.immutable.ListMap
import scala.swing.Dialog
import scala.swing.Dialog.Result
import scala.swing.Swing
import scala.swing.Swing.EmptyIcon
import scala.swing.Swing.nullPeer

import javax.swing.JOptionPane
import org.fs.chm.dao._
import org.fs.chm.utility.EntityUtils
import org.fs.utility.Imports._
import org.json4s._
import org.json4s.jackson.JsonMethods

class TelegramSingleChatDataLoader extends TelegramDataLoader with TelegramDataLoaderCommon {

  override def doesLookRight(rootFile: File): Option[String] = {
    checkFormatLooksRight(rootFile, Seq("name", "type", "id", "messages"))
  }

  /** Path should point to the folder with `result.json` and other stuff */
  override protected def loadDataInner(rootFile: File): EagerChatHistoryDao = {
    implicit val dummyTracker = new FieldUsageTracker
    val resultJsonFile: File = new File(rootFile, "result.json").getAbsoluteFile
    if (!resultJsonFile.exists()) {
      throw new FileNotFoundException("result.json not found in " + rootFile.getAbsolutePath)
    }

    val dataset = Dataset.createDefault("Telegram", "telegram")

    val parsed = JsonMethods.parse(resultJsonFile)

    val users = parseUsers(parsed, dataset.uuid)
    val myself = chooseMyself(users)

    val messagesRes = (for {
      message <- getCheckedField[IndexedSeq[JValue]](parsed, "messages")
    } yield MessageParser.parseMessageOption(message, rootFile)).yieldDefined

    val chatRes = parseChat(parsed, dataset.uuid, messagesRes.size)

    new EagerChatHistoryDao(
      name               = "Telegram export data from " + rootFile.getName,
      _dataRootFile      = rootFile.getAbsoluteFile,
      dataset            = dataset,
      myself1            = myself,
      users1             = users,
      _chatsWithMessages = ListMap(chatRes -> messagesRes)
    )
  }

  protected def chooseMyself(users: Seq[User]): User = {
    val options = users map (u => EntityUtils.getOrUnnamed(u.firstNameOption))
    val res = JOptionPane.showOptionDialog(
      null,
      "Choose yourself",
      "Which one of them is you?",
      Dialog.Options.Default.id,
      Dialog.Message.Question.id,
      Swing.wrapIcon(EmptyIcon),
      (options map (_.asInstanceOf[AnyRef])).toArray,
      options.head
    )
    if (res == JOptionPane.CLOSED_OPTION) {
      throw new IllegalArgumentException("Well, tough luck")
    } else {
      users(res)
    }
  }

  //
  // Parsers
  //

  private def parseMyself(jv: JValue, dsUuid: UUID): User = {
    implicit val tracker = new FieldUsageTracker
    tracker.markUsed("bio") // Ignoring bio
    tracker.ensuringUsage(jv) {
      User(
        dsUuid             = dsUuid,
        id                 = getCheckedField[Long](jv, "user_id"),
        firstNameOption    = getStringOpt(jv, "first_name", true),
        lastNameOption     = getStringOpt(jv, "last_name", true),
        usernameOption     = getStringOpt(jv, "username", true),
        phoneNumberOption  = getStringOpt(jv, "phone_number", true),
        lastSeenTimeOption = None
      )
    }
  }

  private def parseUser(jv: JValue, dsUuid: UUID): User = {
    implicit val tracker = new FieldUsageTracker
    tracker.ensuringUsage(jv) {
      User(
        dsUuid             = dsUuid,
        id                 = getCheckedField[Long](jv, "user_id"),
        firstNameOption    = getStringOpt(jv, "first_name", true),
        lastNameOption     = getStringOpt(jv, "last_name", true),
        usernameOption     = None,
        phoneNumberOption  = getStringOpt(jv, "phone_number", true),
        lastSeenTimeOption = stringToDateTimeOpt(getCheckedField[String](jv, "date"))
      )
    }
  }

  private def parseShortUserFromMessage(jv: JValue): ShortUser = {
    implicit val dummyTracker = new FieldUsageTracker
    getCheckedField[String](jv, "type") match {
      case "message" =>
        ShortUser(
          id             = getCheckedField[Long](jv, "from_id"),
          fullNameOption = getStringOpt(jv, "from", true)
        )
      case "service" =>
        ShortUser(
          id             = getCheckedField[Long](jv, "actor_id"),
          fullNameOption = getStringOpt(jv, "actor", true)
        )
      case other =>
        throw new IllegalArgumentException(
          s"Don't know how to parse message of type '$other' for ${jv.toString.take(500)}")
    }
  }

  /** Parse users from chat messages to get as much info as possible. */
  private def parseUsers(parsed: JValue, dsUuid: UUID): Seq[User] = {
    implicit val dummyTracker = new FieldUsageTracker

    // Doing additional pass over messages to fetch all users
    val messageUsers = (
      for {
        message <- getCheckedField[IndexedSeq[JValue]](parsed, "messages")
        if (getCheckedField[String](message, "type") != "unsupported")
      } yield parseShortUserFromMessage(message)
    ).toSet
    require(messageUsers.forall(_.id > 0), "All user IDs in messages must be positive!")

    val fullUsers = messageUsers.map {
      case ShortUser(id, fullNameOption) => //
        User(
          dsUuid             = dsUuid,
          id                 = id,
          firstNameOption    = fullNameOption,
          lastNameOption     = None,
          usernameOption     = None,
          phoneNumberOption  = None,
          lastSeenTimeOption = None
        )
    }

    fullUsers.toSeq sortBy (u => (u.id, u.prettyName))
  } ensuring { users =>
    // Ensuring all IDs are unique
    users.toStream.map(_.id).toSet.size == users.size
  }
}