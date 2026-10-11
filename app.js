import express from 'express';
import cors from 'cors'

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();



const port = 8000;

app.use(cors({
  origin: [
    "http://localhost:8000",
    "https://my-pezf19ye5-ami-33f7.vercel.app"
  ]
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// app.use('/api', router)

const filePath = path.join(__dirname, "./middleware/trading.json");

async function readData() {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const initial = { trades: [] };
      await writeData(initial);
      return initial;
    }
    throw error;
  }
}

async function writeData(data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// বাংলাদেশ সময় অনুযায়ী তারিখ
function getToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getTodayTrades(trades) {
  return trades.filter(trade => trade.date === getToday());
}

// আজকের Dashboard
app.get("/api/dashboard", async (req, res) => {
  try {
    const data = await readData();
    const todayTrades = getTodayTrades(data.trades);

    const wins = todayTrades.filter(t => t.result === "win").length;
    const losses = todayTrades.filter(t => t.result === "loss").length;
    const total = todayTrades.length;
    const lastTrade = todayTrades.at(-1);

    res.json({
      date: getToday(),
      total,
      wins,
      losses,
      winRate: total ? Number((wins / total * 100).toFixed(2)) : 0,
      currentBalance: lastTrade
        ? lastTrade.balanceAfter
        : null,
      trades: todayTrades,
      formOpen: total < 2 && losses === 0
    });
  } catch (error) {
    res.status(500).json({ message: "Dashboard load failed" });
  }
});

// নতুন ট্রেড সংরক্ষণ
app.post("/api/trades", async (req, res) => {
  try {
    const { balance, amount, result } = req.body;

    if (
      !Number.isFinite(balance) || balance < 0 ||
      !Number.isFinite(amount) || amount <= 0 ||
      amount > balance ||
      !["win", "loss"].includes(result)
    ) {
      return res.status(400).json({
        message: "সঠিক ব্যালেন্স, এন্ট্রি অ্যামাউন্ট ও ফলাফল দিন"
      });
    }

    const data = await readData();
    const todayTrades = getTodayTrades(data.trades);

    // প্রতিদিন সর্বোচ্চ দুইটি ট্রেড এবং
    // Loss হলে পরবর্তী ট্রেড নিষিদ্ধ
    if (todayTrades.length >= 2 ||
        todayTrades.some(t => t.result === "loss")) {
      return res.status(403).json({
        message: "আজকের ট্রেডিং সীমা শেষ"
      });
    }

    // প্রথম ট্রেডের ব্যালেন্স এবং পরের ট্রেডের
    // ব্যালেন্স আগের ট্রেডের ফলাফলের সাথে মিলিয়ে নিন
    const previous = todayTrades.at(-1);

    if (previous && balance !== previous.balanceAfter) {
      return res.status(400).json({
        message: "ব্যালেন্স আগের ট্রেডের সমাপনী ব্যালেন্সের সাথে মিলছে না"
      });
    }

    // এখানে Win হলে এন্ট্রি অ্যামাউন্টের সমান
    // লাভ ধরা হয়েছে। বাস্তব লাভ আলাদা হলে
    // payout/profit ফিল্ড যোগ করে পরিবর্তন করুন।
 const profit = result === "win"
  ? amount * 0.90
  : -amount;

const balanceAfter = balance + profit;

    const trade = {
      id: Date.now().toString(),
      date: getToday(),
      balance,
      amount,
      result,
      profit,
      balanceAfter,
      createdAt: new Date().toISOString()
    };

    data.trades.push(trade);
    await writeData(data);

    res.status(201).json({
      message: "ট্রেড সংরক্ষণ হয়েছে",
      trade
    });
  } catch (error) {
    res.status(500).json({ message: "সার্ভার সমস্যা" });
  }
});

// সব দিনের ট্রেড হিস্ট্রি
app.get("/api/trades", async (req, res) => {
  try {
    const data = await readData();
    res.json(data.trades.slice().reverse());
  } catch (error) {
    res.status(500).json({ message: "ডাটা লোড করা যায়নি" });
  }
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});