import os
import json
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
import pickle
from itertools import combinations

# --- Load dữ liệu từ tất cả quán ---
folder_path = "ml/recommendDishDataset"
all_rows = []

for filename in os.listdir(folder_path):
    if filename.endswith(".json"):
        file_path = os.path.join(folder_path, filename)
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            all_rows.extend(data)

df = pd.DataFrame(all_rows)
print("[OK] Loaded", len(df), "rows from", folder_path)

# --- Tiền xử lý ---
df = df.dropna(subset=[
    "totalRevenue",
    "totalSold",
    "totalIngredientStock",
    "totalIngredientWaste",
    "ingredientCount",
    "toppingCount",
    "ingredients"
])

# --- Tạo danh sách tất cả nguyên liệu ---
all_ingredients = sorted(list({ing for sublist in df['ingredients'] for ing in sublist}))
print("[INFO] All ingredients:", all_ingredients)

# --- One-hot encode nguyên liệu ---
for ing in all_ingredients:
    df[f"ing_{ing}"] = df['ingredients'].apply(lambda x: 1 if ing in x else 0)

# --- Feature và target ---
feature_cols = ["totalSold", "totalIngredientStock", "totalIngredientWaste", "ingredientCount", "toppingCount"] + [f"ing_{i}" for i in all_ingredients]
X = df[feature_cols]
y = df["totalRevenue"]

# --- Huấn luyện model ---
model = RandomForestRegressor(n_estimators=200, random_state=42)
model.fit(X, y)

# --- Lưu model và danh sách nguyên liệu ---
os.makedirs("ml", exist_ok=True)
model_path = "ml/recommendDishModel.pkl"
with open(model_path, "wb") as f:
    pickle.dump({
        "model": model,
        "ingredients": all_ingredients,
        "feature_cols": feature_cols
    }, f)

print(f"✅ Model trained and saved to {model_path}")
