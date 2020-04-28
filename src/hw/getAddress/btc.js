// @flow

import type { CryptoCurrency } from "../../types";
import Btc from "@ledgerhq/hw-app-btc";
import type Transport from "@ledgerhq/hw-transport";
import { BtcUnmatchedApp, UpdateYourApp } from "../../errors";
import getBitcoinLikeInfo from "../getBitcoinLikeInfo";

const oldP2SH = {
  digibyte: 5
};

export default async (
  transport: Transport<*>,
  currency: CryptoCurrency,
  path: string,
  verify: boolean
) => {
  const segwit = path.startsWith("49'");
  const btc = new Btc(transport);
  const { bitcoinAddress, publicKey } = await btc.getWalletPublicKey(
    path,
    verify,
    segwit
  );

  const { bitcoinLikeInfo } = currency;
  if (bitcoinLikeInfo) {
    const { P2SH, P2PKH } = await getBitcoinLikeInfo(transport);
    if (P2SH !== bitcoinLikeInfo.P2SH || P2PKH !== bitcoinLikeInfo.P2PKH) {
      if (
        currency.id in oldP2SH &&
        P2SH === oldP2SH[currency.id] &&
        P2PKH === bitcoinLikeInfo.P2PKH
      ) {
        throw new UpdateYourApp(`UpdateYourApp ${currency.id}`, currency);
      }
      throw new BtcUnmatchedApp(`BtcUnmatchedApp ${currency.id}`, currency);
    }
  }

  return { address: bitcoinAddress, path, publicKey };
};
