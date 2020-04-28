// @flow

import axios from "axios";
import createCounterValues from "@ledgerhq/live-common/lib/countervalues";
import { pairsSelector } from "./reducers/markets";
import { setExchangePairsAction } from "./actions/markets";

// provide a basic mecanism to stop polling when you leave the tab
// & immediately poll when you come back.
const addExtraPollingHooks = (schedulePoll, cancelPoll) => {
  function onWindowBlur() {
    cancelPoll();
  }
  function onWindowFocus() {
    schedulePoll(1000);
  }
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("focus", onWindowFocus);
  return () => {
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("focus", onWindowFocus);
  };
};

export default createCounterValues({
  network: axios,
  log: (...args) => console.log(...args), // eslint-disable-line no-console
  getAPIBaseURL: () => window.LEDGER_CV_API,
  storeSelector: state => state.countervalues,
  pairsSelector,
  setExchangePairsAction,
  addExtraPollingHooks
});
