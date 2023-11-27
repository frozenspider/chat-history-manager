package org.fs.chm.loader

import java.io.File

import scala.concurrent.ExecutionContext
import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future
import scala.language.implicitConversions

import org.fs.chm.dao.ChatHistoryDao
import org.fs.chm.dao.Entities.MessageInternalId
import org.fs.chm.dao.Entities.MessageSourceId
import org.fs.chm.protobuf._
import org.fs.chm.utility.Logging

class GrpcDaoService(doLoad: File => ChatHistoryDao)
  extends HistoryLoaderServiceGrpc.HistoryLoaderService
    with Logging {
  implicit private val ec: ExecutionContextExecutor = ExecutionContext.global

  private val lock = new Object

  private var daoMap: Map[String, ChatHistoryDao] = Map.empty

  /** Parse/open a history file and return its DAO handle */
  override def load(request: ParseLoadRequest): Future[LoadResponse] = {
    val file = new File(request.path)
    Future {
      val key = request.path
      val dao = doLoad(file)
      lock.synchronized {
        daoMap = daoMap + (key -> dao)
      }
      LoadResponse(Some(LoadedFile(key = request.path, name = dao.name)))
    }
  }

  override def getLoadedFiles(request: GetLoadedFilesRequest): Future[GetLoadedFilesResponse] = {
    val loaded = lock.synchronized {
      for {
        (key, dao) <- daoMap
      } yield LoadedFile(key, dao.name)
    }
    Future.successful(GetLoadedFilesResponse(loaded.toSeq))
  }

  override def name(request: NameRequest): Future[NameResponse] =
    withDao(request, request.key)(dao => NameResponse(dao.name))

  override def storagePath(request: StoragePathRequest): Future[StoragePathResponse] =
    withDao(request, request.key)(dao => StoragePathResponse(dao.storagePath.getAbsolutePath))

  override def datasets(request: DatasetsRequest): Future[DatasetsResponse] =
    withDao(request, request.key)(dao => DatasetsResponse(dao.datasets))

  override def datasetRoot(request: DatasetRootRequest): Future[DatasetRootResponse] =
    withDao(request, request.key)(dao => DatasetRootResponse(dao.datasetRoot(request.dsUuid).getAbsolutePath))

  override def myself(request: MyselfRequest): Future[MyselfResponse] =
    withDao(request, request.key)(dao => MyselfResponse(dao.myself(request.dsUuid)))

  override def users(request: UsersRequest): Future[UsersResponse] =
    withDao(request, request.key)(dao => UsersResponse(dao.users(request.dsUuid)))

  override def chats(request: ChatsRequest): Future[ChatsResponse] =
    withDao(request, request.key)(dao => ChatsResponse(
      dao.chats(request.dsUuid)
        .map(cwd => ChatWithDetailsPB(cwd.chat, cwd.lastMsgOption, cwd.members))))

  override def scrollMessages(request: ScrollMessagesRequest): Future[MessagesResponse] =
    withDao(request, request.key)(dao => MessagesResponse(
      dao.scrollMessages(request.chat, request.offset.toInt, request.limit.toInt)))

  override def lastMessages(request: LastMessagesRequest): Future[MessagesResponse] =
    withDao(request, request.key)(dao => MessagesResponse(
      dao.lastMessages(request.chat, request.limit.toInt)))

  /** Return N messages before the given one (exclusive). Message must be present. */
  override def messagesBefore(request: MessagesBeforeRequest): Future[MessagesResponse] =
    withDao(request, request.key)(dao => MessagesResponse(
      dao.messagesBefore(request.chat, request.messageInternalId, request.limit.toInt).dropRight(1)))

  /** Return N messages after the given one (exclusive). Message must be present. */
  override def messagesAfter(request: MessagesAfterRequest): Future[MessagesResponse] =
    withDao(request, request.key)(dao => MessagesResponse(
      dao.messagesAfter(request.chat, request.messageInternalId, request.limit.toInt).tail))

  /** Return N messages between the given ones (inclusive). Messages must be present. */
  override def messagesSlice(request: MessagesSliceRequest): Future[MessagesResponse] =
    withDao(request, request.key)(dao => MessagesResponse(
      dao.messagesSlice(request.chat, request.messageInternalId1, request.messageInternalId2)))

  /** Count messages between the given ones (inclusive). Messages must be present. */
  override def messagesSliceLen(request: MessagesSliceRequest): Future[CountMessagesResponse] =
    withDao(request, request.key)(dao => CountMessagesResponse(
      dao.messagesSliceLength(request.chat, request.messageInternalId1, request.messageInternalId2)))

  override def messageOption(request: MessageOptionRequest): Future[MessageOptionResponse] =
    withDao(request, request.key)(dao => MessageOptionResponse(
      dao.messageOption(request.chat, request.sourceId.asInstanceOf[MessageSourceId])))

  override def messageOptionByInternalId(request: MessageOptionByInternalIdRequest): Future[MessageOptionResponse] =
    withDao(request, request.key)(dao => MessageOptionResponse(
      dao.messageOptionByInternalId(request.chat, request.internalId)))

  /** Whether given data path is the one loaded in this DAO. */
  override def isLoaded(request: IsLoadedRequest): Future[IsLoadedResponse] =
    withDao(request, request.key)(dao => IsLoadedResponse(
      dao.isLoaded(new File(request.storagePath))))

  override def close(request: CloseRequest): Future[CloseResponse] = {
    Future {
      val key = request.key
      lock.synchronized {
        val dao = daoMap(key)
        daoMap = daoMap - key
        dao.close();
      }
      CloseResponse(success = true)
    }
  }

  //
  // Helpers
  //

  private def withDao[T](req: Object, key: String)(f: ChatHistoryDao => T): Future[T] = {
    Future {
      try {
        log.debug(s"<<< Request:  ${req.toString.take(150)}")
        val res = lock.synchronized {
          f(daoMap(key))
        }
        log.debug(s">>> Response: ${res.toString.linesIterator.next().take(150)}")
        res
      } catch {
        case th: Throwable =>
          log.debug(s">>> Failure:  ${th.toString.take(150)}")
          throw th
      }
    }
  }

  private implicit def toInternal(l: Long): MessageInternalId = l.asInstanceOf[MessageInternalId]
}
