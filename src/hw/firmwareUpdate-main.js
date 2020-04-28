// @flow
import { Observable, from, of, empty, concat } from "rxjs";
import {
  concatMap,
  delay,
  scan,
  distinctUntilChanged,
  throttleTime
} from "rxjs/operators";

import { CantOpenDevice } from "../errors";
import type { FirmwareUpdateContext } from "../types/manager";
import { withDevicePolling } from "../hw/deviceAccess";
import getDeviceInfo from "../hw/getDeviceInfo";
import flash from "../hw/flash";
import installFinalFirmware from "../hw/installFinalFirmware";

const wait2s = of({ type: "wait" }).pipe(delay(2000));

type Res = {
  installing: ?string,
  progress: number
};

const main = (
  deviceId: string,
  { final, shouldFlashMCU }: FirmwareUpdateContext
): Observable<Res> => {
  const withDeviceInfo = withDevicePolling(deviceId)(
    transport => from(getDeviceInfo(transport)),
    () => true // accept all errors. we're waiting forever condition that make getDeviceInfo work
  );

  const withDeviceInstall = install =>
    withDevicePolling(deviceId)(
      install,
      e => e instanceof CantOpenDevice // this can happen if withDevicePolling was still seeing the device but it was then interrupted by a device reboot
    );

  const waitForBootloader = withDeviceInfo.pipe(
    concatMap(
      deviceInfo =>
        deviceInfo.isBootloader ? empty() : concat(wait2s, waitForBootloader)
    )
  );

  const bootloaderLoop = withDeviceInfo.pipe(
    concatMap(
      deviceInfo =>
        !deviceInfo.isBootloader
          ? empty()
          : concat(withDeviceInstall(flash(final)), wait2s, bootloaderLoop)
    )
  );

  const finalStep = withDeviceInfo.pipe(
    concatMap(
      deviceInfo =>
        !deviceInfo.isOSU ? empty() : withDeviceInstall(installFinalFirmware)
    )
  );

  const all = shouldFlashMCU
    ? concat(waitForBootloader, bootloaderLoop, finalStep)
    : finalStep;

  // $FlowFixMe something wrong with the flow def of scan()
  return all.pipe(
    scan(
      (acc: Res, e): Res => {
        if (e.type === "install") {
          // $FlowFixMe
          return { installing: e.step, progress: 0 };
        } else if (e.type === "bulk-progress") {
          return { ...acc, progress: e.progress };
        }
        return acc;
      },
      { progress: 0, installing: null }
    ),
    distinctUntilChanged(),
    throttleTime(100)
  );
};

export default main;
