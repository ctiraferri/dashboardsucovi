"""
Fix followers_count in metrics.json: convert daily gains to absolute counts.
The IG insights follower_count metric returns net new followers per day.
We reconstruct absolute counts by working backwards from the current total.
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
metrics_path = DATA_DIR / "metrics.json"

with open(metrics_path, "r", encoding="utf-8") as f:
    metrics = json.load(f)

daily = sorted(metrics["daily"], key=lambda d: d["date"])
current_followers = metrics["account"]["followers_count"]

# All entries have daily net gains from the insights API.
# Sum all gains to find the base count before the first entry.
gains = [d["followers_count"] for d in daily]
total_gained = sum(gains)
base = current_followers - total_gained

print(f"Current followers: {current_followers}")
print(f"Total gained over period: {total_gained}")
print(f"Base before first entry: {base}")

# Reconstruct absolute counts by accumulating gains
cumulative = 0
for i, entry in enumerate(daily):
    cumulative += gains[i]
    entry["followers_count"] = base + cumulative

metrics["daily"] = daily

with open(metrics_path, "w", encoding="utf-8") as f:
    json.dump(metrics, f, indent=2, ensure_ascii=False)

print("\nFixed follower counts:")
for entry in daily:
    print(f"  {entry['date']}: {entry['followers_count']:,}")
