// @flow
import type Transport from "@ledgerhq/hw-transport";
import { Observable, from, of, concat } from "rxjs";
import { mergeMap } from "rxjs/operators";
import ManagerAPI from "../api/Manager";
import getDeviceInfo from "./getDeviceInfo";
import type { FinalFirmware, DeviceInfo } from "../types/manager";

const blVersionAliases = {
  "0.0": "0.6",
  "0.0.0": "0.6"
};

export default (finalFirmware: FinalFirmware) => (
  transport: Transport<*>
): Observable<*> =>
  from(getDeviceInfo(transport)).pipe(
    mergeMap(({ seVersion: blVersion, targetId }: DeviceInfo) =>
      (blVersion in blVersionAliases
        ? of(blVersionAliases[blVersion])
        : from(ManagerAPI.getNextBLVersion(finalFirmware.mcu_versions[0]))
      ).pipe(
        mergeMap(mcuVersion => {
          let version;
          let isMCU = false;
          if (typeof mcuVersion === "string") {
            version = mcuVersion;
          } else {
            isMCU = blVersion === mcuVersion.from_bootloader_version;
            version = isMCU
              ? mcuVersion.name
              : mcuVersion.from_bootloader_version;
          }
          return concat(
            of({
              type: "install",
              step: "flash-" + (isMCU ? "mcu" : "bootloader")
            }),
            ManagerAPI.installMcu(transport, "mcu", {
              targetId,
              version
            })
          );
        })
      )
    )
  );
