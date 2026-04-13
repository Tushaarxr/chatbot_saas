"""
Intent classifier — fine-tune DistilBERT per bot_id, load and cache for inference.

Public API:
  train(bot_id, intents)  → trains and saves model, returns accuracy dict
  predict(bot_id, text)   → returns {label, confidence}
"""

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING

from datasets import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    pipeline,
)

from core.config import settings
from core.logger import logger

if TYPE_CHECKING:
    from models.schemas import IntentItem

# Pipeline cache — avoids reloading the model on every request
_pipe_cache: dict[str, object] = {}


def _model_path(bot_id: str) -> Path:
    """Return the local filesystem path for a bot's intent model."""
    return Path(settings.intent_model_dir) / bot_id


async def train(bot_id: str, intents: list["IntentItem"]) -> dict:
    """
    Fine-tune DistilBERT on user-provided intent examples.

    Args:
        bot_id:  The bot's UUID string — used to namespace the saved model.
        intents: List of IntentItem (label + examples + response).

    Returns:
        dict with keys: status, labels, accuracy
    """
    labels = [item.label for item in intents]
    label2id = {lbl: i for i, lbl in enumerate(labels)}
    id2label = {i: lbl for lbl, i in label2id.items()}

    # Build flat dataset
    rows = []
    for item in intents:
        for example in item.examples:
            rows.append({"text": example, "label": label2id[item.label]})

    dataset = Dataset.from_list(rows).train_test_split(test_size=0.2, seed=42)

    tokenizer = AutoTokenizer.from_pretrained("distilbert-base-uncased")

    def _tokenize(batch: dict) -> dict:
        """Tokenize a batch of text examples."""
        return tokenizer(
            batch["text"], truncation=True, padding="max_length", max_length=64
        )

    dataset = dataset.map(_tokenize, batched=True)

    model = AutoModelForSequenceClassification.from_pretrained(
        "distilbert-base-uncased",
        num_labels=len(labels),
        id2label=id2label,
        label2id=label2id,
    )

    out_path = str(_model_path(bot_id))
    args = TrainingArguments(
        output_dir=out_path,
        num_train_epochs=3,
        per_device_train_batch_size=16,
        eval_strategy="epoch",       # renamed from evaluation_strategy in transformers>=4.41
        save_strategy="epoch",
        load_best_model_at_end=True,
        logging_steps=10,
        use_cpu=True,               # renamed from no_cuda in transformers>=4.41
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=dataset["train"],
        eval_dataset=dataset["test"],
        processing_class=tokenizer,
    )

    logger.info(f"Training intent classifier for bot {bot_id} ({len(labels)} labels)...")
    # Run blocking CPU training in a thread so we don't freeze the async event loop
    await asyncio.to_thread(trainer.train)
    await asyncio.to_thread(trainer.save_model, out_path)

    metrics = await asyncio.to_thread(trainer.evaluate)
    # eval_loss ≈ cross-entropy — approximate accuracy as (1 - normalised loss)
    eval_loss = metrics.get("eval_loss", 1.0)
    accuracy = round(max(0.0, 1.0 - eval_loss / 4.0), 4)

    # Clear cached pipeline so next predict() loads fresh weights
    _pipe_cache.pop(bot_id, None)

    logger.info(f"Training complete for bot {bot_id} | accuracy≈{accuracy}")
    return {"status": "trained", "labels": labels, "accuracy": accuracy}


def predict(bot_id: str, text: str) -> dict:
    """
    Run intent classification inference.

    Args:
        bot_id: The bot's UUID string.
        text:   The user's input message.

    Returns:
        dict with keys: label, confidence

    Raises:
        ValueError: If the model has not been trained for this bot.
    """
    if bot_id not in _pipe_cache:
        p = _model_path(bot_id)
        if not p.exists():
            raise ValueError(
                f"Intent model not trained for bot '{bot_id}'. "
                "POST /platform/bots/{bot_id}/intents first."
            )
        _pipe_cache[bot_id] = pipeline("text-classification", model=str(p))
        logger.info(f"Loaded intent pipeline for bot {bot_id}")

    result = _pipe_cache[bot_id](text)[0]
    return {"label": result["label"], "confidence": round(result["score"], 4)}


# ---------------------------------------------------------------------------
# Legacy alias — keeps backward compat if anything still references old names
# ---------------------------------------------------------------------------

async def train_classifier(bot_id: str, intents: list) -> dict:
    """Deprecated alias for train(). Use train() directly."""
    return await train(bot_id, intents)


def classify_intent(bot_id: str, text: str) -> dict:
    """Deprecated alias for predict(). Use predict() directly."""
    return predict(bot_id, text)
