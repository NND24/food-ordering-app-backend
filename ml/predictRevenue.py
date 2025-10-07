import sys
import json
import pickle
import pandas as pd

with open("ml/recommendDishModel.pkl", "rb") as f:
    data = pickle.load(f)

model = data["model"]
all_ingredients = data["ingredients"]
feature_cols = data["feature_cols"]

# Input JSON từ Node.js
if len(sys.argv) < 2:
    print(json.dumps({"predictedRevenue": 0}))
    sys.exit(1)

features_json = sys.argv[1]
features = json.loads(features_json)

# One-hot encode nguyên liệu
for ing in all_ingredients:
    features[f"ing_{ing}"] = 1 if ing in features.get("ingredients", []) else 0

# Chỉ giữ feature_cols
X = pd.DataFrame([{c: features.get(c, 0) for c in feature_cols}])

prediction = model.predict(X)[0]
print(json.dumps({"predictedRevenue": round(float(prediction), 2)}))
