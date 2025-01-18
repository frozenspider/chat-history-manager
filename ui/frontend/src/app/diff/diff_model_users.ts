import { DatasetState, GrpcServices } from "@/app/utils/state";
import { DiffData } from "@/app/diff/diff";
import { User } from "@/protobuf/core/protobuf/entities";


export type UsersDiffModelRow = [User, DatasetState]
export type UsersDiffModel = DiffData<UsersDiffModelRow>[]

export async function MakeUsersDiffModel(
  masterDsState: DatasetState,
  slaveDsState: DatasetState,
  activeUserIds: Set<bigint>,
  services: GrpcServices,
) {
  let masterUsers = (await services.daoClient.users({
    key: masterDsState.fileKey,
    dsUuid: masterDsState.ds.uuid
  })).users

  let slaveUsers = (await services.daoClient.users({
    key: slaveDsState.fileKey,
    dsUuid: slaveDsState.ds.uuid
  })).users

  interface InSlaveOnly {
    tpe: "slave"
    user: User
  }

  interface InBoth {
    tpe: "both"
    masterUser: User
    slaveUser: User
    has_changes: boolean
  }

  // Exclude non-active users
  let merges: Array<InSlaveOnly | InBoth> = slaveUsers.map(su => {
    let mu = masterDsState.users.get(su.id)
    if (!mu) {
      return { tpe: "slave", user: su }
    } else {
      const hasDifferentValue = (lens: (u: User) => string | undefined) => {
        const lensSu = lens(su)
        return !!(lensSu && lensSu !== lens(mu))
      }

      let has_changes: boolean = hasDifferentValue(u => u.firstNameOption) ||
        hasDifferentValue(u => u.lastNameOption) ||
        hasDifferentValue(u => u.usernameOption) ||
        hasDifferentValue(u => u.phoneNumberOption)

      return {
        tpe: "both",
        masterUser: mu,
        slaveUser: su,
        has_changes
      }
    }
  })

  let model: UsersDiffModel = []

  // 1) Combined and unchanged users
  let combinesMasterToDataMap = new Map<bigint, InBoth>(
    merges.filter(rd => rd.tpe === "both").map(rd => [rd.masterUser.id, rd as InBoth])
  )
  for (const mu of masterUsers) {
    let rd = combinesMasterToDataMap.get(mu.id)
    if (rd) {
      model.push({
        tpe: rd.has_changes ? "change" : "no-change",
        left: [[mu, masterDsState]],
        right: [[rd.slaveUser, slaveDsState]]
      })
    } else {
      model.push({
        tpe: "keep",
        left: [[mu, masterDsState]],
        right: []
      })
    }
  }

  // 2) Added users
  let additionsSlaveToDataMap = new Map<bigint, InSlaveOnly>(
    merges.filter(rd => rd.tpe === "slave").map(rd => [rd.user.id, rd as InSlaveOnly])
  )
  for (const su of slaveUsers) {
    if (additionsSlaveToDataMap.has(su.id)) {
      model.push({
        tpe: activeUserIds.has(su.id) ? "add" : "dont-add",
        left: [],
        right: [[su, slaveDsState]]
      })
    }
  }

  return model
}
