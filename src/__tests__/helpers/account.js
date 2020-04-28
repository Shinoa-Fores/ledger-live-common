// @flow
import flatMap from "lodash/flatMap";
import { getFiatCurrencyByTicker } from "../../currencies";
import {
  getBalanceHistory,
  getBalanceHistorySum,
  groupAccountOperationsByDay,
  groupAccountsOperationsByDay
} from "../../account";
import { genAccount } from "../../mock/account";

test("getBalanceHistory(*,30) returns an array of 30 items", () => {
  const history = getBalanceHistory(genAccount("seed_1"), 30);
  expect(history).toBeInstanceOf(Array);
  expect(history.length).toBe(30);
  expect(history).toMatchSnapshot();
});

test("getBalanceHistory(*,365) works as well", () => {
  const history = getBalanceHistory(genAccount("seed_2"), 256);
  expect(history[history.length - 1].date);
  expect(history).toMatchSnapshot();
});

test("getBalanceHistory last item is now and have an amount equals to account balance", () => {
  const account = genAccount("seed_3");
  const history = getBalanceHistory(account, 50);
  expect(history[history.length - 1].date).toMatchObject(new Date());
  expect(history[history.length - 1].value).toBe(account.balance);
  expect(history).toMatchSnapshot();
});

test("getBalanceHistorySum works with one account and is identically to that account history", () => {
  const account = genAccount("seed_4");
  const history = getBalanceHistory(account, 10);
  const allHistory = getBalanceHistorySum(
    [account],
    10,
    (account, value, date) => value // using identity, at any time, 1 token = 1 USD
  );
  expect(allHistory).toMatchObject(history);
  expect(allHistory).toMatchSnapshot();
});

test("getBalanceHistorySum with twice same account will double the amounts", () => {
  const account = genAccount("seed_5");
  const history = getBalanceHistory(account, 10);
  const allHistory = getBalanceHistorySum(
    [account, account],
    10,
    (account, value, date) => value // using identity, at any time, 1 token = 1 USD
  );
  allHistory.forEach((h, i) => {
    expect(h.value.toString()).toBe(history[i].value.times(2).toString());
  });
});

test("getBalanceHistorySum calculateCounterValue is taken into account", () => {
  const account = genAccount("seed_6");
  const history = getBalanceHistory(account, 10);
  const allHistory = getBalanceHistorySum(
    [account, account],
    10,
    (account, value, date) => value.div(2)
  );
  expect(allHistory).toMatchObject(history);
});

test("getBalanceHistorySum with lot of accounts", () => {
  const allHistory = getBalanceHistorySum(
    Array(60)
      .fill(null)
      .map((_, i) => genAccount("mult" + i)),
    10,
    (account, value, date) => value // using identity, at any time, 1 token = 1 USD
  );
  expect(allHistory).toMatchSnapshot();
});

test("groupAccountOperationsByDay", () => {
  const account = genAccount("seed_7");
  const res1 = groupAccountOperationsByDay(account, 10);
  expect(res1.completed).toBe(false);
  expect(res1).toMatchSnapshot();
  const res2 = groupAccountOperationsByDay(account, Infinity);
  expect(res2.completed).toBe(true);
  expect(
    // $FlowFixMe
    flatMap(res2.sections, s => s.data).slice(0, 10)
  ).toMatchObject(
    // $FlowFixMe
    flatMap(res1.sections, s => s.data)
  );
});

test("groupAccountsOperationsByDay", () => {
  const accounts = Array(10)
    .fill(null)
    .map((_, i) => genAccount("gaobd" + i));
  const res1 = groupAccountsOperationsByDay(accounts, 100);
  expect(res1.completed).toBe(false);
  expect(res1).toMatchSnapshot();
  const res2 = groupAccountsOperationsByDay(accounts, Infinity);
  expect(res2.completed).toBe(true);
  expect(
    // $FlowFixMe
    flatMap(res2.sections, s => s.data).slice(0, 100)
  ).toMatchObject(
    // $FlowFixMe
    flatMap(res1.sections, s => s.data)
  );
});

// TODO testing calculateCounterValue is correctly called for picking diff coins/dates.
