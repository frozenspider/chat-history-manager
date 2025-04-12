import { DatasetState, GrpcServices } from "@/app/utils/state";
import { DiffData } from "@/app/diff/diff";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";


export type ChatsDiffModelRow = [ChatWithDetailsPB, DatasetState]
export type ChatsDiffModel = DiffData<ChatsDiffModelRow>[]

export async function MakeChatsDiffModel(
  masterDsState: DatasetState,
  slaveDsState: DatasetState,
  services: GrpcServices,
): Promise<ChatsDiffModel> {

  // Fetch these from the server to keep the ordering
  let masterCwds = (await services.daoClient.chats({ key: masterDsState.fileKey, dsUuid: masterDsState.ds.uuid })).cwds
  let slaveCwds = (await services.daoClient.chats({ key: slaveDsState.fileKey, dsUuid: slaveDsState.ds.uuid })).cwds

  let masterCwdsById = Map.groupBy(masterCwds, cwd => cwd.chat!.id)
  let slaveCwdsById = Map.groupBy(slaveCwds, cwd => cwd.chat!.id)

  let model: ChatsDiffModel = []

  // TODO: check order
  // 1) Combined and unchanged chats
  for (const masterCwd of masterCwds) {
    let slaveCwds = slaveCwdsById.get(masterCwd.chat!.id) || []
    model.push({
      tpe: slaveCwds.length > 0 ? "change" : "keep",
      left: [[masterCwd, masterDsState]],
      right: slaveCwds.map(cwd => [cwd, slaveDsState])
    })
  }

  // 2) Added chats
  for (const slaveCwd of slaveCwds) {
    if (!masterCwdsById.has(slaveCwd.chat!.id)) {
      model.push({
        tpe: "add",
        left: [],
        right: [[slaveCwd, slaveDsState]]
      })
    }
  }

  return model
}
