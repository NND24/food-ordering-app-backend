from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from transformers import (
    AutoImageProcessor, 
    AutoModelForImageClassification,
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
import httpx

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
            f"Kỳ tới: doanh thu {forecast['predictedRevenue']:,.0f} ₫, lợi nhuận {forecast['predictedProfit']:,.0f} ₫."
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

    def round_values(obj, digits=2):
        if isinstance(obj, float):
            return round(obj, digits)
        if isinstance(obj, list):
            return [round_values(x, digits) for x in obj]
        if isinstance(obj, dict):
            return {k: round_values(v, digits) for k, v in obj.items()}
        return obj

    return round_values(
        clean_invalid_values({
            "decomposition": decomposition,
            "forecast": forecast,
            "insightMessages": insight_messages,
            "simulatedForecast": simulated_forecast,
            "scenarioInsights": scenario_insights,
        }),
        digits=2
    )


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

food_info_norm = {}

# Hàm classify (Từ code mới của bạn)
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
# Hàm sinh mô tả (ĐÃ SỬA LỖI LOGIC VÀ THỨ TỰ)
def generate_caption(label: str, user_extras: List[str] = None) -> str:
    # 0. Chuẩn bị dữ liệu và kiểm tra Fallback 1
    # Làm sạch, chuyển chữ thường và lọc bỏ phần tử rỗng cho user_extras
    user_extras = [item.strip().lower() for item in user_extras if item.strip()] if user_extras else []
    
    label_norm = normalize_label(label)
    info = food_info_norm.get(label_norm)

    if not info:
        return f"Món {label} thơm ngon, hấp dẫn, chắc chắn làm hài lòng thực khách."

    # 1. Lấy dữ liệu đặc trưng và kiểm tra Fallback 2
    display_name = info.get("display_name", label)
    taste = info.get("taste", [])
    texture = info.get("texture", [])
    style = info.get("style", [])

    all_sensations = taste + texture # Bao gồm cả Vị và Kết cấu
    
    # Fallback 2: Kiểm tra dữ liệu cốt lõi (Ít nhất 2 mô tả cảm giác và có phong cách)
    if len(all_sensations) < 2 or not style:
        return f"Món {display_name} có hương vị và phong cách độc đáo, là một lựa chọn tuyệt vời."

    # 2. Lựa chọn Ngẫu nhiên
    # Chọn ngẫu nhiên 2 mô tả cảm giác khác nhau
    sensation_1, sensation_2 = random.sample(all_sensations, k=2) 
    style_desc = random.choice(style)

    random_user_extras = "các nguyên liệu tinh túy"
    if user_extras:
        # Lấy 1-3 nguyên liệu ngẫu nhiên để làm văn
        random_user_extras = ", ".join(random.sample(user_extras, k=min(len(user_extras), random.randint(1, 3))))

    # 4. Templates (Tối ưu hóa và Đa dạng hơn)
    templates = [
        # Template A: Nhấn mạnh Phong cách và Cảm giác
        (f"Món {display_name} thể hiện đúng tinh hoa {style_desc}. "
        f"Hương vị này trở nên đặc sắc với thành phần cốt lõi là {random_user_extras} "
        f"và mang lại cảm giác {sensation_1} khó quên, hòa quyện với {sensation_2}."),
        
        # Template B: Nhấn mạnh Vị giác, Kết cấu và Nguyên liệu (Phù hợp cho mọi loại món)
        (f"Thưởng thức {display_name} là một trải nghiệm {style_desc} phong phú. "
        f"Sự cân bằng tuyệt vời giữa vị {sensation_1} và kết cấu {sensation_2} "
        f"được làm giàu thêm bởi {random_user_extras}."), # Thay đổi vị trí ingredient_clause_t1_t2
        
        # Template C: Mô tả ngắn gọn, thu hút và Ngữ cảnh (Rất phù hợp cho món nước/tráng miệng)
        (f"Món {display_name} độc đáo và hấp dẫn tạo nên bởi"
        f" sự kết hợp giữa các thành phần như {random_user_extras}. Vị {sensation_1} và cảm giác {sensation_2} "
        f"sẽ chinh phục mọi thực khách."),
        
        # Template D: Nhấn mạnh sự phức hợp, Tinh tế và Thành phần
        (f"Sức hấp dẫn của {display_name} đến từ sự phức hợp tinh tế. "
        f"Tổng thể mang lại cảm giác {sensation_1} và {sensation_2} khó tả. "
        f"Là một {style_desc} được tạo nên bởi {random_user_extras},..."),
    ]
    
    return random.choice(templates)

@app.on_event("startup")
async def load_resources():
    global processor_cls, model_cls, food_info_norm, food_info
    try:
        # 1. Load Model Phân loại
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
async def generate_caption_unified(
    ingredients: List[str] = Form([], description="Các thành phần trong món ăn."),
    file: Optional[UploadFile] = File(None, description="File ảnh món ăn (chỉ cần 1 trong 2: File hoặc URL)"),
    image_url: Optional[str] = Form(None, description="URL của ảnh món ăn (chỉ cần 1 trong 2: File hoặc URL)")
):
    
    # --- 1. Kiểm tra đầu vào và Tải/Đọc ảnh ---
    
    if not file and not image_url:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp File ảnh hoặc URL ảnh.")
    
    if file and image_url:
        raise HTTPException(status_code=400, detail="Không thể cung cấp đồng thời cả File ảnh và URL ảnh.")
        
    image_pil = None
    
    # Trường hợp 1: Nhận File tải lên
    if file:
        # Kiểm tra loại file
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File tải lên phải là ảnh.")
        
        try:
            image_bytes = await file.read()
            image_pil = Image.open(io.BytesIO(image_bytes))
        except Exception:
             raise HTTPException(status_code=400, detail="File tải lên không thể đọc được dưới dạng ảnh.")

    # Trường hợp 2: Nhận URL ảnh
    elif image_url:
        try:
            # Tải ảnh từ URL
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(image_url)
                response.raise_for_status() 
            
            # Kiểm tra Content-Type
            content_type = response.headers.get("Content-Type", "")
            if not content_type.startswith("image/"):
                raise HTTPException(status_code=400, detail="URL không trỏ đến một file ảnh hợp lệ.")

            image_bytes = response.content
            image_pil = Image.open(io.BytesIO(image_bytes))

        except httpx.InvalidURL:
            raise HTTPException(status_code=400, detail="URL ảnh không hợp lệ.")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=400, detail=f"Lỗi khi tải ảnh: {e.response.status_code} - {e.response.reason_phrase}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lỗi server khi tải ảnh từ URL: {e}")
            
    # --- 2. Xử lý logic nghiệp vụ (Phân loại và Sinh mô tả) ---
    
    try:
        # 2. Phân loại ảnh
        prediction = classify_food(image_pil)
        
        if not prediction:
            raise HTTPException(status_code=500, detail="Không thể dự đoán món ăn từ ảnh.")
        
        # Xử lý tham số ingredients
        print("Ingredients received:", ingredients)
        print("Data type of ingredients:", type(ingredients))
        # 1. Kiểm tra và lấy ra phần tử đầu tiên
        raw_ingredients_str = ingredients[0] if ingredients and isinstance(ingredients, list) else ""
        
        # 2. Tách chuỗi theo dấu phẩy (,) và làm sạch từng phần tử
        user_extras = [
            item.strip().lower() 
            for item in raw_ingredients_str.split(',') 
            if item.strip()
        ]
        
        # 3. Sinh mô tả
        caption = generate_caption(
            label=prediction, 
            user_extras=user_extras
        )
        
        # 4. Trả về kết quả
        return {
            "success": True, 
            "prediction": prediction,
            "caption": caption
        }
    except HTTPException as h:
        raise h 
    except Exception as e:
        # logger.error(f"Lỗi xử lý nghiệp vụ: {e}") 
        raise HTTPException(status_code=500, detail="Lỗi server khi phân loại và sinh mô tả.")
    