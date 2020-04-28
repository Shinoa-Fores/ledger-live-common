// @flow

import invariant from "invariant";
import type Transport from "@ledgerhq/hw-transport";
import { Observable, Subject } from "rxjs";
import {
  WebsocketConnectionError,
  WebsocketConnectionFailed,
  DeviceSocketFail,
  DeviceSocketNoBulkStatus
} from "../errors";
import { cancelDeviceAction } from "../hw/deviceAccess";
import { createWebSocket } from "../network";

const logsSubject = new Subject();
const warningsSubject = new Subject();

export const logs: Observable<*> = logsSubject.asObservable();
export const warnings: Observable<string> = warningsSubject.asObservable();

const log = (obj: *) => {
  logsSubject.next(obj);
};

export type SocketEvent =
  | {
      type: "bulk-progress",
      progress: number
    }
  | {
      type: "result",
      payload: string
    }
  | {
      type: "warning",
      message: string
    }
  | {
      type: "exchange",
      nonce: number
    }
  | {
      type: "opened"
    }
  | {
      type: "closed"
    };

/**
 * use Ledger WebSocket API to exchange data with the device
 * Returns an Observable of the final result
 */
export const createDeviceSocket = (
  transport: Transport<*>,
  {
    url,
    ignoreWebsocketErrorDuringBulk
  }: {
    url: string,
    // ignoreWebsocketErrorDuringBulk is a workaround to continue bulk even if the ws connection is termined
    // the WS connection can be terminated typically because ws timeout
    ignoreWebsocketErrorDuringBulk?: boolean
  }
): Observable<SocketEvent> =>
  Observable.create(o => {
    let ws;
    let lastMessage: ?string;
    let interrupted = false;
    let terminated = false;
    let inBulk = false;

    try {
      ws = createWebSocket(url);
    } catch (err) {
      o.error(new WebsocketConnectionFailed(err.message, { url }));
      return () => {};
    }
    invariant(ws, "websocket is available");

    ws.onopen = () => {
      o.next({ type: "opened" });
      log({ type: "socket-opened", url });
    };

    ws.onerror = e => {
      log({ type: "socket-error", message: e.message, stack: e.stack });
      if (!inBulk || !ignoreWebsocketErrorDuringBulk) {
        terminated = true;
        o.error(new WebsocketConnectionError(e.message, { url }));
      }
    };

    ws.onclose = () => {
      log({ type: "socket-close" });
      if (!inBulk || !ignoreWebsocketErrorDuringBulk) {
        terminated = true;
        o.next({ type: "result", payload: lastMessage || "" });
        o.complete();
      }
    };

    const send = (nonce, response, data) => {
      const msg = {
        nonce,
        response,
        data
      };
      log({ type: "socket-send", message: msg });
      const strMsg = JSON.stringify(msg);
      ws.send(strMsg);
    };

    const handlers = {
      exchange: async input => {
        const { data, nonce } = input;
        const r: Buffer = await transport.exchange(Buffer.from(data, "hex"));
        if (interrupted) return;
        o.next({ type: "exchange", nonce });
        const status = r.slice(r.length - 2);
        const buffer = r.slice(0, r.length - 2);
        const strStatus = status.toString("hex");
        send(
          nonce,
          strStatus === "9000" ? "success" : "error",
          buffer.toString("hex")
        );
      },

      bulk: async input => {
        inBulk = true;
        try {
          const { data, nonce } = input;

          o.next({ type: "bulk-progress", progress: 0 });

          // Execute all apdus and collect last status
          let lastStatus = null;
          for (let i = 0; i < data.length; i++) {
            const apdu = data[i];
            const r: Buffer = await transport.exchange(
              Buffer.from(apdu, "hex")
            );
            lastStatus = r.slice(r.length - 2);
            if (lastStatus.toString("hex") !== "9000") break;
            if (interrupted) return;
            o.next({ type: "bulk-progress", progress: (i + 1) / data.length });
          }

          if (!lastStatus) {
            throw new DeviceSocketNoBulkStatus();
          }

          const strStatus = lastStatus.toString("hex");

          if (ignoreWebsocketErrorDuringBulk && ws.readyState !== 1) {
            terminated = true;
            o.next({
              type: "result",
              payload: lastStatus ? lastStatus.toString("hex") : ""
            });
            o.complete();
          } else {
            send(
              nonce,
              strStatus === "9000" ? "success" : "error",
              strStatus === "9000" ? "" : strStatus
            );
          }
        } finally {
          inBulk = false;
        }
      },

      success: msg => {
        lastMessage = msg.data || msg.result;
        ws.close();
      },

      error: msg => {
        log({ type: "socket-message-error", message: msg.data });
        throw new DeviceSocketFail(msg.data, { url });
      },

      warning: (msg: { data: string }) => {
        log({ type: "socket-message-warning", message: msg.data });
        o.next({
          type: "warning",
          message: msg.data
        });
        warningsSubject.next(msg.data);
      }
    };

    const stackMessage = async e => {
      if (interrupted) return;
      try {
        const msg = JSON.parse(e.data);
        log({ type: "socket-receive", msg });
        if (!(msg.query in handlers)) {
          console.warn(`Cannot handle msg of type ${msg.query}`, {
            query: msg.query,
            url
          });
          return;
        }
        await handlers[msg.query](msg);
      } catch (err) {
        log({
          type: "socket-message-error",
          message: err.message,
          stack: err.stack
        });
        o.error(err);
      }
    };

    ws.onmessage = rawMsg => {
      stackMessage(rawMsg).catch(e => {
        o.error(e);
      });
    };

    return () => {
      interrupted = true;
      if (!terminated) {
        cancelDeviceAction(transport);
      }
      if (ws.readyState !== 1) return;
      ws.close();
    };
  });
