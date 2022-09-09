var express = require("express");
var router = express.Router();
const Binance = require("node-binance-api");
const mysql2 = require("mysql2/promise");
require("dotenv").config();
const pool = mysql2.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});
const binance = new Binance().options({
  APIKEY: process.env.APIKEY,
  APISECRET: process.env.APISECRET,
});

router.post("/open", function (req, res) {
  let symbol = req.body.market;
  let invest = req.body.invest;
  let key = req.body.key;
  if (
    symbol !== undefined &&
    invest !== undefined &&
    invest > 0 &&
    key !== undefined
  ) {
    const verification = selectKey(key);
    verification.then((verify) => {
      verify = verify[0];
      console.log(verify);
      if (verify.length > 0) {
        let user_id = verify[0].id;
        binance.bookTickers((error, ticker) => {
          var current_ticker = ticker.filter(function (market) {
            return market.symbol == symbol;
          });
          current_ticker = current_ticker[0];

          let current_price = current_ticker.askPrice;

          const order_exist = selectOrderExit(symbol, "OPEN", user_id);
          order_exist.then((order_exist_data) => {
            console.log(order_exist_data[0][0].cont);
            if (order_exist_data[0][0].cont == 0) {
              let balance = parseFloat(invest / current_price, 4).toFixed(5);

              const insert_order = createOrder(
                symbol,
                current_price,
                invest,
                balance,
                user_id
              );
              insert_order.then(() => {
                const get_balance = selectBalance(user_id);
                get_balance.then((bank) => {
                  let last_balance = bank[0][0].balance;
                  let new_balance = last_balance - invest;
                  let new_balance_update = newBalance(
                    new_balance,
                    invest,
                    "OPEN",
                    user_id
                  );
                  new_balance_update.then(() => {
                    res.json({ status: true, msg: "Order created" });
                  });
                });
              });
            } else {
              res.json({
                status: true,
                msg: "Already exist a order for that market",
              });
            }
          });
        });
      } else {
        res.json({
          status: false,
          msg: "API KEY ERROR",
        });
      }
    });
  }
});

router.post("/close", function (req, res) {
  let symbol = req.body.market;
  let key = req.body.api_key;
  if (symbol !== undefined && key !== undefined) {
    const verification = selectKey(key);
    verification.then((verify) => {
      verify = verify[0];
      console.log(verify);
      if (verify.length > 0) {
        let user_id = verify[0].id;
        binance.bookTickers((error, ticker) => {
          var current_ticker = ticker.filter(function (market) {
            return market.symbol == symbol;
          });
          current_ticker = current_ticker[0];

          let current_price = current_ticker.askPrice;

          let order_opened = selectOrderOpened(symbol);
          order_opened.then((order_data) => {
            order_data = order_data[0];
            if (order_data.length > 0) {
              let id = order_data[0].id;
              let balance = order_data[0].balance;
              let open_price = order_data[0].open_price;
              let invest = order_data[0].invest;
              let invest_return = parseFloat(balance * current_price).toFixed(
                3
              );
              let benefit = invest_return - invest;
              let profit = parseFloat((benefit * 100) / invest).toFixed(3);
              const order_close = closeOrder(
                id,
                current_price,
                invest_return,
                benefit,
                profit,
                user_id
              );
              order_close.then(() => {
                const get_balance = selectBalance(user_id);
                get_balance.then((bank) => {
                  let last_balance = bank[0][0].balance;
                  let new_balance = last_balance - invest_return;
                  let new_balance_update = newBalance(
                    new_balance,
                    invest,
                    "CLOSED",
                    user_id
                  );
                  new_balance_update.then(() => {
                    res.json({ status: true, msg: "Order Closed" });
                  });
                });
              });
            } else {
              res.json({ status: true, msg: "No orders to close" });
            }
          });
        });
      } else {
        res.json({
          status: false,
          msg: "API KEY ERROR",
        });
      }
    });
  } else {
    res.json({
      status: false,
      msg: "ERROR",
    });
  }
});

async function createOrder(symbol, open_price, invest, balance, user_id) {
  const result = await pool.query(
    "INSERT INTO orders SET symbol = ?, open_price=?, invest = ?, balance = ?, user_id=?",
    [symbol, open_price, invest, balance, user_id]
  );
}

async function closeOrder(
  id,
  close_price,
  invest_return,
  benefit,
  profit,
  user_id
) {
  const result = await pool.query(
    "UPDATE orders SET close_price = ?, invest_return=?, benefit = ?, profit = ?, status='CLOSED' where id=? and user_id=?",
    [close_price, invest_return, benefit, profit, id, user_id]
  );
}

async function newBalance(balance, balance_change, type, user_id) {
  const result = await pool.query(
    "INSERT INTO bank SET balance=?, movement=?, type=?, user_id=? ",
    [balance, balance_change, type, user_id]
  );
  return result;
}

async function selectOrderExit(symbol, type, user_id) {
  const result = await pool.query(
    `SELECT count(id) as cont FROM orders where symbol='${symbol}' and status='${type}' and user_id=${user_id}`
  );
  return result;
}
async function selectOrderOpened(symbol, user_id) {
  const result = await pool.query(
    `SELECT * FROM orders where status='OPEN' and symbol='${symbol}' and user_id=${user_id}`
  );
  return result;
}

async function selectBalance(user_id) {
  const result = await pool.query(
    `SELECT * FROM bank where user_id=${user_id} order by created_at desc limit 1`
  );
  return result;
}

async function selectKey(key) {
  const result = await pool.query(
    `SELECT *  FROM users where api_key='${key}'`
  );
  return result;
}

module.exports = router;
