const cron = require("node-cron");
const { collectRecommendDataForAllStores } = require("../utils/recommendDataCollector");
const { exec } = require("child_process");

cron.schedule("0 2 * * *", async () => {
  dailyRecommendTask();
});

async function dailyRecommendTask() {
  console.log("🕑 Starting daily recommend data collection...");
  await collectRecommendDataForAllStores();

  console.log("🕑 Retraining ML model...");
  exec("python ml/train_recommend_model.py", (err, stdout, stderr) => {
    if (err) return console.error("❌ Error retraining model:", err);
    if (stderr) console.error("Python stderr:", stderr);
    console.log(stdout);
    console.log("✅ ML model retrained successfully.");
  });
}
