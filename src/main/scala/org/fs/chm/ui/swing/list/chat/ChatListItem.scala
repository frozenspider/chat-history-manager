package org.fs.chm.ui.swing.list.chat

import java.awt.Color
import java.awt.{Container => AwtContainer}

import scala.swing.BorderPanel.Position._
import scala.swing._
import scala.swing.event._
import javax.swing.SwingUtilities
import javax.swing.border.EmptyBorder
import javax.swing.border.LineBorder

import org.apache.commons.lang3.StringEscapeUtils
import org.fs.chm.dao.ChatHistoryDao
import org.fs.chm.dao.Entities._
import org.fs.chm.protobuf.ChatType
import org.fs.chm.protobuf.Content
import org.fs.chm.protobuf.Message
import org.fs.chm.protobuf.MessageRegular
import org.fs.chm.protobuf.MessageService
import org.fs.chm.ui.swing.list.DaoItem
import org.fs.chm.ui.swing.general.SwingUtils._
import org.fs.chm.utility.EntityUtils

class ChatListItem(
    dao: ChatHistoryDao,
    cwd: ChatWithDetails,
    selectionGroupOption: Option[ChatListItemSelectionGroup],
    callbacksOption: Option[ChatListSelectionCallbacks]
) extends BorderPanel { self =>
  private val labelPreferredWidth = DaoItem.PanelWidth - 100 // TODO: Remove

  val chat = cwd.chat

  private val labelBorderWidth = 3

  private val popupMenu = new PopupMenu {
    contents += menuItem("Details")(showDetailsPopup())
    contents += new Separator()
    contents += menuItem("Delete", enabled = callbacksOption.nonEmpty && dao.isMutable)(showDeletePopup())
  }

  private var _activeColor:   Color = Color.LIGHT_GRAY
  private var _inactiveColor: Color = Color.WHITE

  {
    val emptyBorder = new EmptyBorder(labelBorderWidth, labelBorderWidth, labelBorderWidth, labelBorderWidth)

    layout(new BorderPanel {
      // Name
      val nameString = cwd.chat.nameOrUnnamed
      val nameLabel = new Label(
        s"""<html><p style="text-align: left; width: ${labelPreferredWidth}px;">"""
          + StringEscapeUtils.escapeHtml4(nameString)
          + "</p></html>")
      nameLabel.border = emptyBorder
      layout(nameLabel) = North

      // Last message
      val lastMsgString = cwd.lastMsgOption match {
        case None      => "<No messages>"
        case Some(msg) => simpleRenderMsg(msg)
      }
      val msgLabel = new Label(lastMsgString)
      msgLabel.horizontalAlignment = Alignment.Left
      msgLabel.foreground          = new Color(0, 0, 0, 100)
      msgLabel.preferredWidth      = labelPreferredWidth
      msgLabel.border              = emptyBorder
      layout(msgLabel) = Center

      opaque = false
    }) = Center

    // Type
    val tpeString = cwd.chat.tpe match {
      case ChatType.Personal     => ""
      case ChatType.PrivateGroup => "(" + cwd.members.size + ")"
    }
    val tpeLabel = new Label(tpeString)
    tpeLabel.preferredWidth    = 30
    tpeLabel.verticalAlignment = Alignment.Center
    layout(tpeLabel) = East

    // Reactions
    listenTo(this, this.mouse.clicks)
    reactions += {
      case e @ MouseReleased(_, __, _, _, _) if SwingUtilities.isLeftMouseButton(e.peer) && enabled =>
        select()
      case e @ MouseReleased(src, pt, _, _, _) if SwingUtilities.isRightMouseButton(e.peer) && enabled =>
        popupMenu.show(src, pt.x, pt.y)
    }

    maximumSize = new Dimension(Int.MaxValue, preferredSize.height)
    markDeselected()
    selectionGroupOption foreach (_.add(this))
  }

  def activeColor:               Color = _activeColor
  def activeColor_=(c: Color):   Unit  = { _activeColor = c; }
  def inactiveColor:             Color = _inactiveColor
  def inactiveColor_=(c: Color): Unit  = _inactiveColor = c

  def select(): Unit = {
    markSelected()
    selectionGroupOption foreach (_.deselectOthers(this))
    callbacksOption foreach (_.chatSelected(dao, cwd))
  }

  def markSelected(): Unit = {
    border     = new LineBorder(Color.BLACK, 1)
    background = _activeColor
  }

  def markDeselected(): Unit = {
    border     = new LineBorder(Color.GRAY, 1)
    background = _inactiveColor
  }

  private def showDetailsPopup(): Unit = {
    Dialog.showMessage(
      title       = "Chat Details",
      message     = new ChatDetailsPane(dao, cwd).peer,
      messageType = Dialog.Message.Plain
    )
  }

  private def showDeletePopup(): Unit = {
    Dialog.showConfirmation(
      title   = "Deleting Chat",
      message = s"Are you sure you want to delete a chat '${cwd.chat.nameOrUnnamed}'?"
    ) match {
      case Dialog.Result.Yes => callbacksOption.get.deleteChat(dao, cwd.chat)
      case _                 => // NOOP
    }
  }

  override def enabled_=(b: Boolean): Unit = {
    super.enabled_=(b)
    def changeClickableRecursive(c: AwtContainer): Unit = {
      c.setEnabled(enabled)
      c.getComponents foreach {
        case c: AwtContainer => changeClickableRecursive(c)
        case _               => // NOOP
      }
    }
    changeClickableRecursive(peer)
  }

  private def simpleRenderMsg(msg: Message): String = {
    val prefix =
      if (cwd.members.size == 2 && msg.fromId == cwd.members(1).id) ""
      else {
        // Avoid querying DB if possible
        val fromNameOption =
          (cwd.members find (_.id == msg.fromId))
            .orElse(dao.userOption(cwd.dsUuid, msg.fromId))
            .flatMap(_.prettyNameOption)
        (fromNameOption.getOrElse(Unnamed) + ": ")
      }
    val text: String = msg.typed.value match {
      case msgRegular: MessageRegular =>
        msgRegular.contentOption map (_.`val`) match {
          case None                               => msg.searchableString.get
          case Some(s: Content.Val.Sticker)       => s.value.emojiOption.map(_ + " ").getOrElse("") + "(sticker)"
          case Some(_: Content.Val.Photo)         => "(photo)"
          case Some(_: Content.Val.VoiceMsg)      => "(voice)"
          case Some(_: Content.Val.VideoMsg)      => "(video)"
          case Some(_: Content.Val.Animation)     => "(animation)"
          case Some(_: Content.Val.File)          => "(file)"
          case Some(_: Content.Val.Location)      => "(location)"
          case Some(_: Content.Val.Poll)          => "(poll)"
          case Some(_: Content.Val.SharedContact) => "(contact)"
        }
      case MessageService(service, _) =>
        service match {
          case _: MessageService.Val.PhoneCall          => "(phone call)"
          case _: MessageService.Val.PinMessage        => "(message pinned)"
          case _: MessageService.Val.ClearHistory       => "(history cleared)"
          case _: MessageService.Val.GroupCreate        => "(group created)"
          case _: MessageService.Val.GroupEditTitle     => "(title changed)"
          case _: MessageService.Val.GroupEditPhoto     => "(photo changed)"
          case _: MessageService.Val.GroupInviteMembers => "(invited members)"
          case _: MessageService.Val.GroupRemoveMembers => "(removed members)"
          case _: MessageService.Val.GroupMigrateFrom   => "(migrated from group)"
          case _: MessageService.Val.GroupMigrateTo     => "(migrated to group)"
          case _: MessageService.Val.GroupCall          => "(group call)"
        }
    }
    prefix + text.take(50)
  }
}

class ChatListItemSelectionGroup {
  private val lock:           AnyRef               = new AnyRef
  private var selectedOption: Option[ChatListItem] = None
  private var items:          Seq[ChatListItem]    = Seq.empty

  def add(item: ChatListItem): Unit = {
    items = items :+ item
  }

  def deselectOthers(item: ChatListItem): Unit =
    lock.synchronized {
      selectedOption = Some(item)
      for (item2 <- items if item2 != item) {
        item2.markDeselected()
      }
    }

  def deselectAll(): Unit =
    lock.synchronized {
      selectedOption = None
      items map (_.markDeselected())
    }
}