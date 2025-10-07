const { execFile } = require("child_process");
const path = require("path");

function predictRevenue(features) {
  return new Promise((resolve, reject) => {
    const pyPath = path.join(__dirname, "../ml/predictRevenue.py");
    const args = [JSON.stringify(features)];

    execFile("python", [pyPath, ...args], (err, stdout, stderr) => {
      if (err) return reject(err);
      if (stderr) console.error("Python stderr:", stderr);

      try {
        const result = JSON.parse(stdout);
        resolve(result.predictedRevenue);
      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = { predictRevenue };
