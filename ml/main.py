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
    df = df.sort_values("period")

    # ---- 1. Phân rã chuỗi thời gian ----
    decomposition = {}
    ts = df["revenue"].astype(float)

    # Xác định chu kỳ theo loại period
    if period_type == "day":
        decomp_period = 24       # dữ liệu theo giờ
    elif period_type == "week":
        decomp_period = 7        # dữ liệu theo ngày
    elif period_type == "month":
        if req.groupBy == "day":
            decomp_period = 30  # khoảng 30 ngày trong tháng
        elif req.groupBy == "week":
            decomp_period = 4   # 4 tuần trong tháng
        else:
            decomp_period = 12  # theo tháng
    else:  # year
        decomp_period = 12      # 12 tháng

    try:
        if len(ts) < decomp_period * 2:
            trend = ts.rolling(window=max(2, len(ts)//2), min_periods=1).mean().fillna(0)
            seasonal = (ts - trend.rolling(window=2, min_periods=1).mean()).fillna(0)
            resid = (ts - trend - seasonal).fillna(0)
            decomposition = {
                "trend": trend.tolist(),
                "seasonal": seasonal.tolist(),
                "resid": resid.tolist(),
                "note": f"⚠️ Không đủ dữ liệu ({len(ts)} điểm) để phân rã theo chu kỳ {decomp_period}, dùng rolling mean thay thế.",
            }
        else:
            result = seasonal_decompose(ts, model="additive", period=decomp_period)
            decomposition = {
                "trend": result.trend.fillna(0).tolist(),
                "seasonal": result.seasonal.fillna(0).tolist(),
                "resid": result.resid.fillna(0).tolist(),
            }
    except Exception as e:
        decomposition = {"error": str(e)}

    # ---- 2. Dự đoán nâng cấp với seasonal ----
    forecast = {}
    try:
        # Chọn seasonal_type = "add" vì decomposition dùng additive
        model = ExponentialSmoothing(
            df["revenue"],
            trend="add",
            seasonal="add",
            seasonal_periods=decomp_period
        )
        model_fit = model.fit()
        pred_full = model_fit.fittedvalues 

        predicted_revenue_next = float(model_fit.forecast(1).tolist()[0])
        predicted_profit_next = predicted_revenue_next - float(df["cost"].iloc[-1])

        forecast = {
            "predictedRevenue": predicted_revenue_next,
            "predictedProfit": predicted_profit_next,
            "avgGrowth": df["revenue"].pct_change().mean() * 100,  # nếu cần %
            "predictedRevenueSeries": pred_full.tolist(),   # chuỗi dự đoán
            "predictedProfitSeries": (pred_full - df["cost"]).tolist(),
        }
    except Exception as e:
        logger.exception("Forecast error")   # sẽ in stacktrace
        forecast = {"error": str(e)}

    # ---- 3. Nhận định tự động (giống cũ) ----
    trend_mean = df["revenue"].diff().mean()
    trend_direction = "tăng" if trend_mean > 0 else "giảm" if trend_mean < 0 else "ổn định"
    seasonal_amplitude = abs(df["revenue"].max() - df["revenue"].min()) * 0.1
    seasonal_strength = "mạnh" if df["revenue"].std() > seasonal_amplitude else "yếu"

    insight_messages = []
    if trend_mean > 0:
        insight_messages.append("📈 Xu hướng tăng: doanh thu có chiều hướng đi lên.")
        if trend_mean > 500:
            insight_messages.append("🚀 Mức tăng mạnh — có thể do marketing hoặc nhu cầu tăng.")
    elif trend_mean < 0:
        insight_messages.append("📉 Xu hướng giảm: doanh thu có dấu hiệu đi xuống.")
        if trend_mean < -500:
            insight_messages.append("⚠️ Cần xem lại giá bán hoặc chiến dịch quảng bá.")
    else:
        insight_messages.append("➡️ Xu hướng ổn định: doanh thu không thay đổi nhiều.")

    if seasonal_strength == "mạnh":
        insight_messages.append("🌤 Mùa vụ rõ rệt: có giai đoạn cao điểm và thấp điểm.")
        insight_messages.append("💡 Gợi ý: tận dụng cao điểm để đẩy mạnh khuyến mãi.")
    else:
        insight_messages.append("🌤 Mùa vụ yếu: doanh thu khá đều, ít bị ảnh hưởng thời điểm.")

    if forecast.get("predictedRevenue"):
        insight_messages.append(
            f"🔮 Dự đoán kỳ tới: doanh thu {forecast['predictedRevenue']:,.0f} ₫, "
            f"lợi nhuận {forecast['predictedProfit']:,.0f} ₫."
        )

    # ---- 4. Mô phỏng kịch bản người dùng (giống cũ) ----
    simulated_forecast = None
    scenario_insights = []

    if req.scenario:
        trend_factor = 1 + req.scenario.trendChange / 100
        seasonal_factor = 1 + req.scenario.seasonalChange / 100
        cost_factor = 1 + req.scenario.costChange / 100

        if "trend" in decomposition and "seasonal" in decomposition:
            simulated_trend = [t * trend_factor for t in decomposition["trend"]]
            simulated_seasonal = [s * seasonal_factor for s in decomposition["seasonal"]]
            simulated_series = [(t + s) for t, s in zip(simulated_trend, simulated_seasonal)]

            next_revenue = simulated_series[-1]
            next_cost = df["cost"].iloc[-1] * cost_factor
            next_profit = next_revenue - next_cost

            simulated_forecast = {
                "predictedRevenue": float(next_revenue),
                "predictedProfit": float(next_profit),
            }

            scenario_insights.append("🧩 Kịch bản giả lập:")
            if req.scenario.trendChange != 0:
                direction = "tăng" if req.scenario.trendChange > 0 else "giảm"
                scenario_insights.append(f"📈 Xu hướng {direction} {abs(req.scenario.trendChange)}%.")
            if req.scenario.seasonalChange != 0:
                direction = "tăng" if req.scenario.seasonalChange > 0 else "giảm"
                scenario_insights.append(f"🌤 Mùa vụ {direction} {abs(req.scenario.seasonalChange)}%.")
            if req.scenario.costChange != 0:
                direction = "tăng" if req.scenario.costChange > 0 else "giảm"
                scenario_insights.append(f"💸 Chi phí {direction} {abs(req.scenario.costChange)}%.")
            scenario_insights.append(
                f"💰 Kết quả mô phỏng: doanh thu ~ {next_revenue:,.0f} ₫, "
                f"lợi nhuận ~ {next_profit:,.0f} ₫."
            )
        else:
            scenario_insights.append("⚠️ Không thể mô phỏng do thiếu dữ liệu decomposition.")

    response_data = {
        "decomposition": decomposition,
        "forecast": forecast,
        "insightMessages": insight_messages,
        "simulatedForecast": simulated_forecast,
        "scenarioInsights": scenario_insights,
    }

    return clean_invalid_values(response_data)

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

def classify_food(image_pil: Image.Image):
    """Phân loại ảnh và chỉ trả về kết quả có độ chính xác cao nhất."""
    if model_cls is None or processor_cls is None:
        raise HTTPException(status_code=503, detail="Dịch vụ model chưa sẵn sàng.")
        
    inputs = processor_cls(images=image_pil.convert("RGB"), return_tensors="pt")
    
    with torch.no_grad():
        outputs = model_cls(**inputs)
    
    probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]
    _, top_index = torch.max(probabilities, dim=-1)
    label = model_cls.config.id2label[top_index.item()]
    
    return label

# Hàm sinh mô tả (Từ code mới của bạn)
def generate_caption(label: str):
    label_norm = normalize_label(label)
    info = food_info_norm.get(label_norm) 

    if not info:
        # Fallback chung nếu không có thông tin
        return [f"Món {label} thơm ngon, hấp dẫn, chắc chắn làm hài lòng thực khách."]

    # 1. Lấy dữ liệu theo cấu trúc mới (ĐÃ CẬP NHẬT)
    display_name = info.get("display_name", label) 
    core_ingredients = info.get("core_ingredients", [])
    secondary_ingredients = info.get("secondary_ingredients", [])
    accompaniments = info.get("accompaniments", [])
    taste = info.get("taste", [])
    texture = info.get("texture", []) # Lấy dữ liệu texture mới
    style = info.get("style", [])
    
    # Gộp Taste và Texture vào một list lớn để chọn ngẫu nhiên (Sensory Experience)
    all_sensations = taste + texture 

    # 2. Kiểm tra dữ liệu tối thiểu (ĐÃ CẬP NHẬT)
    # Cần ít nhất 1 core, 2 cảm giác (để random 2 cái khác nhau), 1 style
    if len(core_ingredients) == 0 or len(all_sensations) < 2 or len(style) == 0:
        # Fallback nếu thông tin không đủ để tạo câu
        return [f"Món {display_name} có thông tin phong phú về nguyên liệu và hương vị, là một lựa chọn tuyệt vời."]

    # 3. Lấy ngẫu nhiên taste/style (ĐÃ CẬP NHẬT: Chọn từ all_sensations)
    # Các biến này đại diện cho cảm giác/hương vị tổng thể
    random_sensation_1 = random.choice(all_sensations)
    random_sensation_2 = random.choice([s for s in all_sensations if s != random_sensation_1]) 
    random_style_desc = random.choice(style) 
    
    # Dùng lại tên biến cũ cho gọn
    random_taste_1 = random_sensation_1 
    random_taste_2 = random_sensation_2
    
    # 4. Xử lý logic ingredients 
    core_ingredient_str = ", ".join(core_ingredients)
    all_extras_list = secondary_ingredients + accompaniments
    other_ingredients_str_t1_t2 = ""
    if len(all_extras_list) > 0:
        # Lấy 2 nếu có thể, không thì lấy 1
        k = min(len(all_extras_list), 2) 
        other_ingredients_str_t1_t2 = ", ".join(random.sample(all_extras_list, k))

    all_extras_str_t3 = ", ".join(all_extras_list)
    
    # 5. Thêm logic phân biệt "Ẩm thực" hay "Thức uống"
    label_norm = label.lower().replace('-', '') # Cần chuẩn hóa label trước
    experience_type = "thức uống" if label_norm == "trasua" else "ẩm thực"

    # 6. Cập nhật Templates (ĐÃ SỬA: Dùng "cảm giác" để bao quát cả vị và kết cấu)
    
    templates = [
        # Template 1: Thay "hương vị... đặc trưng" bằng "cảm giác..."
        f"{display_name} là {random_style_desc}. {core_ingredient_str} là linh hồn tạo nên cảm giác {random_taste_1}." +
        (f" Sự kết hợp được làm giàu bởi {other_ingredients_str_t1_t2} mang lại trải nghiệm {experience_type} khó quên." if other_ingredients_str_t1_t2 else ""),
        
        # Template 2: Giữ nguyên (Cụm "cân bằng tuyệt vời giữa cảm giác... và hương vị..." đã hoạt động tốt)
        f"Thưởng thức {display_name} là một trải nghiệm vị giác phong phú. Điểm đặc sắc là {core_ingredient_str}" +
        (f" hòa quyện cùng {other_ingredients_str_t1_t2}" if other_ingredients_str_t1_t2 else "") +
        f", tạo ra một sự cân bằng tuyệt vời giữa cảm giác {random_taste_1} và hương vị {random_taste_2}.",
        
        # Template 3: Giữ nguyên (Sử dụng "cảm giác")
        f"Sức hấp dẫn của {display_name} đến từ sự phức hợp của các thành phần. Ngoài {core_ingredient_str} là yếu tố cốt lõi, " +
        (f"đây còn là sự kết hợp nhuần nhuyễn giữa {all_extras_str_t3}. " if all_extras_str_t3 else "") +
        f"Tổng thể mang lại cảm giác {random_taste_1} và là đại diện cho {random_style_desc}."
    ]
    
    return random.choice(templates)

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
          summary="Phân loại ảnh và sinh ra mô tả món ăn")
async def generate_caption_from_image(file: UploadFile = File(..., description="File ảnh món ăn")):
    
    # 1. Kiểm tra loại file
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File tải lên phải là ảnh.")
    
    try:
        # Đọc ảnh và chuyển sang đối tượng PIL
        image_bytes = await file.read()
        image_pil = Image.open(io.BytesIO(image_bytes))
        
        # 2. Phân loại ảnh
        prediction = classify_food(image_pil)
        
        if not prediction:
            raise HTTPException(status_code=500, detail="Không thể dự đoán món ăn từ ảnh.")
        
        # 3. Sinh 3 mô tả (Đã đổi tên hàm)
        caption = generate_caption(prediction)
        
        # 4. Trả về kết quả
        return {
            "success": True, 
            "prediction": prediction,
            "caption": caption
        }
    except HTTPException as h:
        raise h 
    except Exception as e:
        # logger.error(f"Lỗi xử lý request: {e}") 
        raise HTTPException(status_code=500, detail="Lỗi server khi phân loại và sinh mô tả.")