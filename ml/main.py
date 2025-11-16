from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from transformers import (
    AutoImageProcessor, 
    AutoModelForImageClassification,
    BlipProcessor,
    BlipForConditionalGeneration,
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
)
from PIL import Image
import requests
import torch
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
from statsmodels.tsa.seasonal import seasonal_decompose
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import numpy as np
import logging
import io
import random

logger = logging.getLogger("uvicorn")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def clean_invalid_values(obj):
    if isinstance(obj, dict):
        return {k: clean_invalid_values(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_invalid_values(v) for v in obj]
    elif isinstance(obj, (float, np.floating)):
        if np.isnan(obj) or np.isinf(obj):
            return 0.0
        return float(obj)
    else:
        return obj


# ---------------------- MODELS ----------------------
class AnalysisItem(BaseModel):
    period: str
    revenue: float
    cost: float
    profit: float
    margin: float
    growth: float

class ScenarioParams(BaseModel):
    trendChange: float = 0     # % thay đổi trend, ví dụ 10 = +10%
    seasonalChange: float = 0  # % thay đổi seasonal
    costChange: float = 0      # % thay đổi chi phí

class AnalyzeRequest(BaseModel):
    data: List[AnalysisItem]
    scenario: Optional[ScenarioParams] = None
    groupBy: Optional[str] = "day"  

# ---------------------- ROUTE ----------------------
@app.post("/analyze")
def analyze(req: AnalyzeRequest, period_type: str = "hour"):
    df = pd.DataFrame([item.dict() for item in req.data])

    # -----------------------------
    # 0. Chuẩn hoá thời gian
    # -----------------------------
    df["period"] = pd.to_datetime(df["period"], errors="coerce")
    df = df.sort_values("period")

    # -----------------------------
    # ⭐ 1. AUTO RESAMPLE (TĂNG DATAPOINT)
    # -----------------------------
    df = df.set_index("period")

    def auto_boost_datapoint(df):
        """
        Tăng số lượng datapoint bằng resample & interpolate tuyến tính.
        Thử lần lượt 6H → 3H → 1H.
        """
        if len(df) >= 40:
            return df  # đã đủ nhiều → không cần tăng

        for freq in ["6h", "3h", "1h"]:
            boosted = df.resample(freq).interpolate(method="linear")
            if len(boosted) >= 40:   # đủ datapoint để decomposition
                return boosted

        return boosted  # dùng bản cuối cùng (1H)

    df = auto_boost_datapoint(df)
    ts = df["revenue"]

    # -----------------------------
    # ⭐ 2. TÍNH DECOMP_PERIOD
    # -----------------------------
    if period_type == "day":
        base_period = 24
    elif period_type == "week":
        base_period = 7
    elif period_type == "month":
        base_period = 30
    else:
        base_period = 12

    # Nếu boost datapoint lên → chu kỳ cần scale lại
    # Ví dụ: ngày → resample 6 giờ ⇒ 1 ngày thành 4 điểm
    inferred_points_per_day = int(24 / (df.index[1] - df.index[0]).total_seconds() * 3600)
    decomp_period = max(2, base_period * inferred_points_per_day // 24)

    # Giới hạn theo độ dài chuỗi
    if len(ts) < decomp_period * 2:
        decomp_period = max(2, len(ts) // 3)

    # -----------------------------
    # ⭐ 3. PHÂN RÃ CHUỖI (DECOMPOSE)
    # -----------------------------
    try:
        if len(ts) < 10:
            raise Exception("Not enough data for decomposition")

        result = seasonal_decompose(ts, model="additive", period=decomp_period)
        decomposition = {
            "trend": result.trend.fillna(0).tolist(),
            "seasonal": result.seasonal.fillna(0).tolist(),
            "resid": result.resid.fillna(0).tolist(),
            "periodUsed": decomp_period,
        }
    except Exception as e:
        # fallback: rolling
        trend = ts.rolling(window=max(2, len(ts)//2)).mean().fillna(0)
        seasonal = ts - trend.rolling(window=2, min_periods=1).mean().fillna(0)
        decomposition = {
            "trend": trend.tolist(),
            "seasonal": seasonal.tolist(),
            "resid": (ts - trend - seasonal).fillna(0).tolist(),
            "periodUsed": decomp_period,
            "note": f"Not enough data for full decomposition, using rolling instead: {str(e)}"
        }

    # -----------------------------
    # ⭐ 4. DỰ BÁO (ExponentialSmoothing)
    # -----------------------------
    try:
        model = ExponentialSmoothing(
            df["revenue"],
            trend="add",
            seasonal="add",
            seasonal_periods=decomp_period
        )
        model_fit = model.fit()

        predicted_revenue_next = float(model_fit.forecast(1)[0])
        predicted_profit_next = predicted_revenue_next - float(df["cost"].iloc[-1])

        pred_full = model_fit.fittedvalues
        forecast = {
            "predictedRevenue": predicted_revenue_next,
            "predictedProfit": predicted_profit_next,
            "avgGrowth": df["revenue"].pct_change().mean() * 100,
            "predictedRevenueSeries": pred_full.tolist(),
            "predictedProfitSeries": (pred_full - df["cost"]).tolist(),
        }

    except Exception as e:
        forecast = {"error": str(e)}

    # -----------------------------
    # ⭐ 5. INSIGHTS 
    # -----------------------------
    trend_mean = df["revenue"].diff().mean()
    trend_direction = "tăng" if trend_mean > 0 else "giảm" if trend_mean < 0 else "ổn định"
    seasonal_strength = (
        "mạnh" if df["revenue"].std() > abs(df["revenue"].max() - df["revenue"].min()) * 0.1 else "yếu"
    )

    insight_messages = []
    if trend_mean > 0:
        insight_messages.append("Xu hướng tăng: doanh thu có chiều hướng đi lên.")
        if trend_mean > 500:
            insight_messages.append("Mức tăng mạnh — có thể do marketing hoặc nhu cầu tăng.")
    elif trend_mean < 0:
        insight_messages.append("Xu hướng giảm: doanh thu có dấu hiệu đi xuống.")
        if trend_mean < -500:
            insight_messages.append("Cần xem lại giá bán hoặc chiến dịch quảng bá.")
    else:
        insight_messages.append("Xu hướng ổn định.")

    if seasonal_strength == "mạnh":
        insight_messages.append("Mùa vụ rõ rệt: có giai đoạn cao điểm – thấp điểm.")
    else:
        insight_messages.append("Mùa vụ yếu: doanh thu khá đều.")

    if forecast.get("predictedRevenue"):
        insight_messages.append(
            f"🔮 Kỳ tới: doanh thu {forecast['predictedRevenue']:,.0f} ₫, lợi nhuận {forecast['predictedProfit']:,.0f} ₫."
        )

    # -----------------------------
    # ⭐ 6. MÔ PHỎNG KỊCH BẢN (giữ logic)
    # -----------------------------
    simulated_forecast = None
    scenario_insights = []

    if req.scenario and "trend" in decomposition:
        trend_factor = 1 + req.scenario.trendChange / 100
        seasonal_factor = 1 + req.scenario.seasonalChange / 100
        cost_factor = 1 + req.scenario.costChange / 100

        simulated_series = [
            t * trend_factor + s * seasonal_factor
            for t, s in zip(decomposition["trend"], decomposition["seasonal"])
        ]

        next_revenue = simulated_series[-1]
        next_cost = df["cost"].iloc[-1] * cost_factor
        next_profit = next_revenue - next_cost

        simulated_forecast = {
            "predictedRevenue": float(next_revenue),
            "predictedProfit": float(next_profit),
        }

        scenario_insights.append("🧩 Kịch bản giả lập:")
        if req.scenario.trendChange != 0:
            scenario_insights.append(f"📈 Xu hướng thay đổi {req.scenario.trendChange}%.")
        if req.scenario.seasonalChange != 0:
            scenario_insights.append(f"🌤 Mùa vụ thay đổi {req.scenario.seasonalChange}%.")
        if req.scenario.costChange != 0:
            scenario_insights.append(f"💸 Chi phí thay đổi {req.scenario.costChange}%.")
        scenario_insights.append(
            f"💰 Dự báo: doanh thu {next_revenue:,.0f} ₫, lợi nhuận {next_profit:,.0f} ₫."
        )

    return clean_invalid_values({
        "decomposition": decomposition,
        "forecast": forecast,
        "insightMessages": insight_messages,
        "simulatedForecast": simulated_forecast,
        "scenarioInsights": scenario_insights,
    })


# ====== BƯỚC 1: BLIP sinh mô tả tiếng Anh ======
processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-large")
model = BlipForConditionalGeneration.from_pretrained(
    "Salesforce/blip-image-captioning-large"
).to("cuda" if torch.cuda.is_available() else "cpu")

# ====== BƯỚC 2: Model dịch & viết lại tiếng Việt ======
translator_tokenizer = AutoTokenizer.from_pretrained("VietAI/envit5-translation")
translator_model = AutoModelForSeq2SeqLM.from_pretrained("VietAI/envit5-translation").to(
    "cuda" if torch.cuda.is_available() else "cpu"
)

def improve_vietnamese_caption(english_caption: str) -> str:
    prompt = f"Translate to Vietnamese: {english_caption}"
    inputs = translator_tokenizer(prompt, return_tensors="pt").to(translator_model.device)
    output = translator_model.generate(**inputs, max_new_tokens=100)
    vi_caption = translator_tokenizer.decode(output[0], skip_special_tokens=True)
    return vi_caption.strip()


@app.post("/caption")
def caption(url: str):
    # ==== Bước 1: tạo mô tả tiếng Anh ====
    image = Image.open(requests.get(url, stream=True).raw).convert("RGB")
    inputs = processor(image, return_tensors="pt").to(model.device)
    out = model.generate(**inputs, max_new_tokens=50)
    english_caption = processor.decode(out[0], skip_special_tokens=True)

    # ==== Bước 2: dịch & cải thiện ====
    vietnamese_caption = improve_vietnamese_caption(english_caption)

    return {"caption_en": english_caption, "caption_vi": vietnamese_caption}


# AI sinh mô tả từ ảnh
try:
    from food_info import food_info
except ImportError:
    logger.warning("food_info module not found. Using empty dict.")
    food_info = {}
    
MODEL_CLS_NAME = "./finetuned_food_model" 
processor_cls = None
model_cls = None


def normalize_label(label: str):
    return label.lower().replace("-", " ").replace("_", " ").strip()

food_info_norm = {} # sẽ được điền khi startup

# Hàm classify (Từ code mới của bạn)
def classify_food_topk(image_pil: Image.Image, top_k: int = 3):
    """Phân loại ảnh."""
    if model_cls is None or processor_cls is None:
        raise HTTPException(status_code=503, detail="Dịch vụ model chưa sẵn sàng.")
        
    inputs = processor_cls(images=image_pil.convert("RGB"), return_tensors="pt")
    
    with torch.no_grad():
        outputs = model_cls(**inputs)
    
    probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]
    topk_prob, topk_indices = torch.topk(probabilities, top_k)
    
    results = []
    for prob, index in zip(topk_prob.tolist(), topk_indices.tolist()):
        label = model_cls.config.id2label[index]
        results.append({"label": label, "score": round(prob, 4)})
        
    return results

# Hàm sinh mô tả (Từ code mới của bạn)
def generate_description(label: str):
    label_norm = normalize_label(label)
    info = food_info_norm.get(label_norm) 

    if not info:
        return [f"Món {label} thơm ngon, hấp dẫn, chắc chắn làm hài lòng thực khách."]

    # Đảm bảo các key tồn tại
    display_name = info.get("display_name", label) 
    ingredients = info.get("ingredients", [])
    taste = info.get("taste", [])
    style = info.get("style", [])

    # Xử lý trường hợp thiếu dữ liệu trong info
    if len(ingredients) < 2 or len(taste) < 3 or len(style) < 3:
         return [f"Món {display_name} có thông tin phong phú về nguyên liệu và hương vị, là một lựa chọn tuyệt vời."]

    # Lấy ngẫu nhiên 2 giá trị từ taste/style (đảm bảo chúng khác nhau nếu cần)
    random_taste_1 = random.choice(taste)
    random_taste_2 = random.choice([t for t in taste if t != random_taste_1]) # Đảm bảo khác nhau

    random_style_desc = random.choice(style) # Lấy ngẫu nhiên một mô tả phong cách/sử dụng

    # Lấy 2 thành phần phụ ngẫu nhiên
    other_ingredients = random.sample(ingredients[1:], 2)
    
    templates = [
        # Template 1: Tập trung vào một yếu tố ngẫu nhiên
        f"{display_name} là {random_style_desc}. {ingredients[0]} là linh hồn tạo nên hương vị {random_taste_1} đặc trưng. Sự kết hợp được làm giàu bởi {', '.join(other_ingredients)} mang lại trải nghiệm ẩm thực/thức uống khó quên.",
        
        # Template 2: Trải nghiệm và sự kết hợp ngẫu nhiên
        f"Thưởng thức {display_name} là một trải nghiệm vị giác phong phú. Điểm đặc sắc là {ingredients[0]} hòa quyện cùng {', '.join(other_ingredients)}, tạo ra một sự cân bằng tuyệt vời giữa cảm giác {random_taste_1} và hương vị {random_taste_2}.",
        
        # Template 3: Mô tả Tổng quan và Đánh giá (Sử dụng tất cả các thành phần phụ còn lại)
        f"Sức hấp dẫn của {display_name} đến từ sự phức hợp của các thành phần. Ngoài {ingredients[0]} là yếu tố cốt lõi, đây còn là sự kết hợp nhuần nhuyễn giữa {', '.join(ingredients[1:])}. Tổng thể mang lại cảm giác {random_taste_1} và là đại diện cho {random_style_desc}."
    ]
    
    return templates

@app.on_event("startup")
async def load_resources():
    global processor_cls, model_cls, food_info_norm, food_info
    try:
        
        # 1. Load Model Phân loại (Sử dụng đường dẫn cục bộ của bạn)
        print("\nĐang tải model Phân loại Ảnh Finetuned Food Model...")
        processor_cls = AutoImageProcessor.from_pretrained(MODEL_CLS_NAME)
        model_cls = AutoModelForImageClassification.from_pretrained(MODEL_CLS_NAME)
        model_cls.eval() 
        
        # 2. Chuẩn hóa food_info
        food_info_norm = {normalize_label(k): v for k, v in food_info.items()}
        
        print("✅ Tải model và dữ liệu thành công.")
        
    except Exception as e:
        print(f"\n❌ LỖI KHÔNG THỂ TẢI MODEL TỪ {MODEL_CLS_NAME}: {e}")
        logger.error(f"Lỗi tải model: {e}")
        model_cls = None

# ----------------------------------------------------------------------
# Endpoint API Chính: Sinh Mô Tả từ Ảnh
# ----------------------------------------------------------------------

@app.post("/generate-caption-from-image", 
          response_model=dict, 
          summary="Phân loại ảnh và sinh ra 3 mô tả món ăn")
async def generate_caption(top_k: int = 1, file: UploadFile = File(..., description="File ảnh món ăn")):
    
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File tải lên phải là ảnh.")
    
    try:
        # Đọc ảnh và chuyển sang đối tượng PIL
        image_bytes = await file.read()
        image_pil = Image.open(io.BytesIO(image_bytes))
        
        # 1. Phân loại ảnh
        predictions = classify_food_topk(image_pil, top_k=top_k)
        
        if not predictions:
             raise HTTPException(status_code=500, detail="Không thể dự đoán món ăn từ ảnh.")
        
        # 2. Lấy nhãn dự đoán cao nhất
        best_label = predictions[0]['label']
        
        # 3. Sinh 3 mô tả
        descriptions = generate_description(best_label)
        
        # 4. Trả về kết quả
        return {
            "success": True, 
            "best_prediction": predictions[0],
            "top_predictions": predictions,
            "descriptions": descriptions # Trả về list 3 mô tả
        }
    except HTTPException as h:
        raise h 
    except Exception as e:
        logger.error(f"Lỗi xử lý request: {e}")
        raise HTTPException(status_code=500, detail="Lỗi server khi phân loại và sinh mô tả.")