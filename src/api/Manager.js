// @flow
/* eslint-disable camelcase */

import URL from "url";
import {
  LatestMCUInstalledError,
  ManagerDeviceLockedError,
  UserRefusedFirmwareUpdate,
  ManagerNotEnoughSpaceError,
  ManagerAppAlreadyInstalledError,
  ManagerAppRelyOnBTCError,
  ManagerUninstallBTCDep
} from "../errors";
import type Transport from "@ledgerhq/hw-transport";
import { throwError } from "rxjs";
import { catchError, filter, last, map } from "rxjs/operators";
import { version as livecommonversion } from "../../package.json";
import { createDeviceSocket } from "./socket";
import network from "../network";
import { getEnv } from "../env";
import type {
  OsuFirmware,
  DeviceVersion,
  FinalFirmware,
  ApplicationVersion,
  Application,
  Category,
  Id,
  McuVersion
} from "../types/manager";
import { makeLRUCache } from "../cache";

const remapSocketError = (context?: string) =>
  catchError((e: Error) => {
    if (!e || !e.message) return throwError(e);
    const status = e.message.slice(e.message.length - 4);
    switch (status) {
      case "6a80":
      case "6a81":
        return throwError(new ManagerAppAlreadyInstalledError());
      case "6982":
        return throwError(new ManagerDeviceLockedError());
      case "6a83":
        if (context === "uninstall-app") {
          return throwError(new ManagerUninstallBTCDep());
        }
        return throwError(new ManagerAppRelyOnBTCError());
      case "6a84":
        return throwError(new ManagerNotEnoughSpaceError());
      case "6a85":
        if (context === "firmware") {
          return throwError(new UserRefusedFirmwareUpdate());
        }
        return throwError(new ManagerNotEnoughSpaceError());
      default:
        return throwError(e);
    }
  });

const API = {
  applicationsByDevice: makeLRUCache(
    async (params: {
      provider: number,
      current_se_firmware_final_version: Id,
      device_version: Id
    }): Promise<Array<ApplicationVersion>> => {
      const r = await network({
        method: "POST",
        url: URL.format({
          pathname: `${getEnv("MANAGER_API_BASE")}/get_apps`,
          query: { livecommonversion }
        }),
        data: params
      });
      return r.data.application_versions;
    },
    p =>
      `${p.provider}_${p.current_se_firmware_final_version}_${p.device_version}`
  ),

  listApps: makeLRUCache(async (): Promise<Array<Application>> => {
    const r = await network({
      method: "GET",
      url: URL.format({
        pathname: `${getEnv("MANAGER_API_BASE")}/applications`,
        query: { livecommonversion }
      })
    });
    return r.data;
  }, () => ""),

  listCategories: async (): Promise<Array<Category>> => {
    const r = await network({
      method: "GET",
      url: URL.format({
        pathname: `${getEnv("MANAGER_API_BASE")}/categories`,
        query: { livecommonversion }
      })
    });
    return r.data;
  },

  getMcus: makeLRUCache(async () => {
    const { data } = await network({
      method: "GET",
      url: URL.format({
        pathname: `${getEnv("MANAGER_API_BASE")}/mcu_versions`,
        query: { livecommonversion }
      })
    });
    return data;
  }, () => ""),

  getLatestFirmware: makeLRUCache(
    async ({
      current_se_firmware_final_version,
      device_version,
      provider
    }: {
      current_se_firmware_final_version: Id,
      device_version: Id,
      provider: number
    }): Promise<?OsuFirmware> => {
      const {
        data
      }: {
        data: {
          result: string,
          se_firmware_osu_version: OsuFirmware
        }
      } = await network({
        method: "POST",
        url: URL.format({
          pathname: `${getEnv("MANAGER_API_BASE")}/get_latest_firmware`,
          query: { livecommonversion }
        }),
        data: {
          current_se_firmware_final_version,
          device_version,
          provider
        }
      });
      if (data.result === "null") {
        return null;
      }
      return data.se_firmware_osu_version;
    },
    a =>
      `${a.current_se_firmware_final_version}_${a.device_version}_${a.provider}`
  ),

  getCurrentOSU: makeLRUCache(
    async (input: {
      version: string,
      deviceId: string | number,
      provider: number
    }): Promise<OsuFirmware> => {
      const { data } = await network({
        method: "POST",
        url: URL.format({
          pathname: `${getEnv("MANAGER_API_BASE")}/get_osu_version`,
          query: { livecommonversion }
        }),
        data: {
          device_version: input.deviceId,
          version_name: `${input.version}-osu`,
          provider: input.provider
        }
      });
      return data;
    },
    a => `${a.version}_${a.deviceId}_${a.provider}`
  ),

  getNextBLVersion: async (
    mcuversion: string | number
  ): Promise<McuVersion> => {
    const { data }: { data: McuVersion | "default" } = await network({
      method: "GET",
      url: URL.format({
        pathname: `${getEnv("MANAGER_API_BASE")}/mcu_versions/${mcuversion}`,
        query: { livecommonversion }
      })
    });

    if (data === "default" || !data.name) {
      throw new LatestMCUInstalledError(
        "there is no next mcu version to install"
      );
    }
    return data;
  },

  getCurrentFirmware: makeLRUCache(
    async (input: {
      fullVersion: string,
      deviceId: string | number,
      provider: number
    }): Promise<FinalFirmware> => {
      const { data }: { data: FinalFirmware } = await network({
        method: "POST",
        url: URL.format({
          pathname: `${getEnv("MANAGER_API_BASE")}/get_firmware_version`,
          query: { livecommonversion }
        }),
        data: {
          device_version: input.deviceId,
          version_name: input.fullVersion,
          provider: input.provider
        }
      });
      return data;
    },
    a => `${a.fullVersion}_${a.deviceId}_${a.provider}`
  ),

  getFinalFirmwareById: makeLRUCache(
    async (id: number): Promise<FinalFirmware> => {
      const { data }: { data: FinalFirmware } = await network({
        method: "GET",
        url: URL.format({
          pathname: `${getEnv(
            "MANAGER_API_BASE"
          )}/firmware_final_versions/${id}`,
          query: { livecommonversion }
        })
      });
      return data;
    },
    id => String(id)
  ),

  getDeviceVersion: makeLRUCache(
    async (
      targetId: string | number,
      provider: number
    ): Promise<DeviceVersion> => {
      const { data }: { data: DeviceVersion } = await network({
        method: "POST",
        url: URL.format({
          pathname: `${getEnv("MANAGER_API_BASE")}/get_device_version`,
          query: { livecommonversion }
        }),
        data: {
          provider,
          target_id: targetId
        }
      });
      return data;
    },
    (targetId, provider) => `${targetId}_${provider}`
  ),

  install: (transport: Transport<*>, context: string, params: *) =>
    createDeviceSocket(transport, {
      url: URL.format({
        pathname: `${getEnv("BASE_SOCKET_URL")}/install`,
        query: { ...params, livecommonversion }
      }),
      ignoreWebsocketErrorDuringBulk: true
    }).pipe(remapSocketError(context)),

  genuineCheck: (
    transport: Transport<*>,
    { targetId, perso }: { targetId: *, perso: * }
  ) =>
    createDeviceSocket(transport, {
      url: URL.format({
        pathname: `${getEnv("BASE_SOCKET_URL")}/genuine`,
        query: { targetId, perso, livecommonversion }
      })
    }).pipe(
      last(),
      filter(o => o.type === "result"),
      map(o => o.payload || "")
    ),

  installMcu: (
    transport: Transport<*>,
    context: string,
    { targetId, version }: { targetId: *, version: * }
  ) =>
    createDeviceSocket(transport, {
      url: URL.format({
        pathname: `${getEnv("BASE_SOCKET_URL")}/mcu`,
        query: { targetId, version, livecommonversion }
      }),
      ignoreWebsocketErrorDuringBulk: true
    }).pipe(remapSocketError(context))
};

export default API;
