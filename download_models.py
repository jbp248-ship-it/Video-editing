#!/usr/bin/env python3
"""
Pre-download AI models for offline use.
Run this once before starting the app:
    python download_models.py

This downloads ~1.6GB of model weights. After this, the app works fully offline.
"""
import sys

MODELS = [
    ("facebook/bart-large-cnn", "summarization"),
]

def download_with_progress(model_name, task):
    print(f"\nDownloading {model_name} for {task}...")
    print("This is a one-time download (~1.6GB). Please wait.\n")
    try:
        from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM

        print("  Downloading tokenizer...")
        AutoTokenizer.from_pretrained(model_name)
        print("  ✓ Tokenizer ready")

        print("  Downloading model weights (this takes a few minutes)...")
        AutoModelForSeq2SeqLM.from_pretrained(model_name)
        print(f"  ✓ Model ready\n")

        print(f"✓ {model_name} downloaded successfully!")
        return True
    except Exception as e:
        print(f"✗ Failed to download {model_name}: {e}")
        return False

def main():
    print("=" * 50)
    print("Video Clipper — AI Model Downloader")
    print("=" * 50)

    try:
        import torch
        import transformers
        print(f"✓ PyTorch {torch.__version__} detected")
        print(f"✓ Transformers {transformers.__version__} detected")
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        print("  Run: pip install -r requirements.txt")
        sys.exit(1)

    success = all(download_with_progress(m, t) for m, t in MODELS)

    if success:
        print("\n✓ All models ready. You can now run: python app.py")
    else:
        print("\n✗ Some models failed to download. Check your internet connection.")
        sys.exit(1)

if __name__ == "__main__":
    main()
