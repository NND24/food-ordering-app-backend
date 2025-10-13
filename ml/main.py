from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from transformers import (
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
