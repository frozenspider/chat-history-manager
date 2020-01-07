package org.fs.chm.ui.swing.merge

import scala.annotation.tailrec
import scala.swing.GridBagPanel.Fill
import scala.swing._
import scala.swing.event.ButtonClicked

import javax.swing.DefaultListSelectionModel
import javax.swing.ListSelectionModel
import javax.swing.WindowConstants
import javax.swing.border.LineBorder
import javax.swing.table.AbstractTableModel
import javax.swing.table.DefaultTableCellRenderer
import javax.swing.table.TableModel
import org.fs.chm.dao.ChatHistoryDao
import org.fs.chm.dao.Dataset
import org.fs.chm.dao.H2ChatHistoryDao
import org.fs.chm.ui.swing.general.SwingUtils._

class SelectMergeDatasetDialog(
    daos: Seq[ChatHistoryDao]
) extends Dialog {
  private val TableWidth = 500

  private val daosWithDatasets        = daos map (dao => (dao, dao.datasets))
  private val mutableDaosWithDatasets = daosWithDatasets filter (_._1.isMutable)

  private val masterTable = createTable("Base dataset", mutableDaosWithDatasets)
  private val slaveTable  = createTable("Dataset to be added to it", daosWithDatasets)

  private var _selectedDaosWithDs: Option[((H2ChatHistoryDao, Dataset), (ChatHistoryDao, Dataset))] = None

  private def createTable(title: String, data: Seq[(ChatHistoryDao, Seq[Dataset])]): Table = {
    val models = new MergeDatasetModels(title, data)
    new Table(models.tableModel) {
      peer.setDefaultRenderer(classOf[Any], new MergeDatasetCellRenderer())
      peer.setSelectionModel(models.selectionModel)
      val col = peer.getColumnModel.getColumn(0)
      col.setMinWidth(TableWidth)
      col.setPreferredWidth(TableWidth)
      peer.setFillsViewportHeight(true)
      rowHeight = 20
      border = LineBorder.createGrayLineBorder()
      val header = peer.getTableHeader
      header.setReorderingAllowed(false)
      header.setResizingAllowed(false)
    }
  }

  {
    val okBtn = new Button("OK")

    contents = new BorderPanel {
      import scala.swing.BorderPanel.Position._

      val panel = new GridBagPanel {
        val c = new Constraints
        c.fill = Fill.Both
        c.gridy = 0
        c.gridx = 0
        peer.add(masterTable.peer.getTableHeader, c.peer)
        c.gridx = 1
        peer.add(slaveTable.peer.getTableHeader, c.peer)

        c.gridy = 1
        c.gridx = 0
        add(masterTable, c)
        c.gridx = 1
        add(slaveTable, c)
      }

      layout(panel) = Center
      layout(new FlowPanel(okBtn)) = South
    }

    modal = true
    defaultButton = okBtn

    peer.setLocationRelativeTo(null)
    peer.setDefaultCloseOperation(WindowConstants.DISPOSE_ON_CLOSE)

    listenTo(okBtn)
    reactions += {
      case ButtonClicked(`okBtn`) => validateAndClose()
    }
  }

  def selection: Option[((H2ChatHistoryDao, Dataset), (ChatHistoryDao, Dataset))] =
    _selectedDaosWithDs

  private def validateAndClose(): Unit = {

    /** Find the DAO for the given dataset row by abusing the table structure */
    @tailrec
    def findDao(tm: TableModel, idx: Int): ChatHistoryDao = tm.getValueAt(idx, 0) match {
      case dao: ChatHistoryDao => dao
      case _                   => findDao(tm, idx - 1)
    }

    val masterRowOption = masterTable.selection.rows.toIndexedSeq.headOption
    val slaveRowOption  = slaveTable.selection.rows.toIndexedSeq.headOption
    (masterRowOption, slaveRowOption) match {
      case (Some(masterRow), Some(slaveRow)) =>
        val masterDs  = masterTable.model.getValueAt(masterRow, 0).asInstanceOf[Dataset]
        val slaveDs   = slaveTable.model.getValueAt(slaveRow, 0).asInstanceOf[Dataset]
        val masterDao = findDao(masterTable.model, masterRow).asInstanceOf[H2ChatHistoryDao]
        val slaveDao  = findDao(slaveTable.model, slaveRow)
        if (masterDao == slaveDao && masterDs == slaveDs) {
          showWarning("Can't merge dataset with itself.")
        } else {
          _selectedDaosWithDs = Some((masterDao, masterDs), (slaveDao, slaveDs))
          dispose()
        }
      case _ =>
        showWarning("Select both base and added datasets.")
    }
  }
}

private class MergeDatasetModels(title: String, values: Seq[(ChatHistoryDao, Seq[Dataset])]) {
  private val elements: IndexedSeq[AnyRef] =
    (for {
      (dao, daoDatasets) <- values
    } yield {
      dao +: daoDatasets
    }).flatten.toIndexedSeq

  val tableModel = new AbstractTableModel {
    override val getRowCount:    Int = elements.size
    override val getColumnCount: Int = 1

    override def getValueAt(rowIndex: Int, columnIndex: Int): AnyRef = elements(rowIndex)

    override def getColumnName(column: Int): String = title
  }

  val selectionModel = new DefaultListSelectionModel {
    setSelectionMode(ListSelectionModel.SINGLE_SELECTION)

    override def setSelectionInterval(unused: Int, idx: Int): Unit = {
      if (idx >= 0 && idx < elements.size && elements(idx).isInstanceOf[ChatHistoryDao]) {
        // Ignore
      } else {
        super.setSelectionInterval(unused, idx)
      }
    }
  }
}

private class MergeDatasetCellRenderer extends DefaultTableCellRenderer {
  override def setValue(v: AnyRef): Unit = v match {
    case dao: ChatHistoryDao =>
      setText(dao.name)
      setFont {
        val oldFont = getFont
        new Font(oldFont.getName, Font.Bold.id, oldFont.getSize + 2)
      }
      setFocusable(false)
      setEnabled(false)
    case ds: Dataset =>
      setText("    " + ds.alias + " (" + ds.uuid.toString.toLowerCase + ")")
      setFocusable(true)
      setEnabled(true)
  }
}
