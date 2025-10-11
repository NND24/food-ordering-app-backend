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

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
