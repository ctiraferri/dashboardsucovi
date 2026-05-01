"""
backfill_metrics.py - Fetches last 30 days of daily Instagram insights.

Usage:
  IG_ACCESS_TOKEN=xxx IG_USER_ID=yyy python scripts/backfill_metrics.py
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from urllib.parse import urlencode

BASE_URL = "https://graph.instagram.com/v21.0"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def api_get(endpoint, params=None):
    token = os.environ.get("IG_ACCESS_TOKEN")
    if not token:
        print("ERROR: IG_ACCESS_TOKEN not set")
        sys.exit(1)
    if params is None:
        params = {}
    params["access_token"] = token
    url = f"{BASE_URL}{endpoint}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "SucoviDashboard/1.0"})
    try:
        with urlopen(req) as response:
            return json.loads(response.read().decode())
    except HTTPError as e:
        body = e.read().decode()
        print(f"API Error {e.code}: {body}")
        raise


def main():
    user_id = os.environ.get("IG_USER_ID", "26948830788081972")
    token = os.environ.get("IG_ACCESS_TOKEN")
    if not token:
        print("ERROR: IG_ACCESS_TOKEN not set")
        sys.exit(1)

    now = datetime.now(timezone.utc)

    # Get account info for current followers
    print("Fetching account info...")
    account = api_get(f"/{user_id}", {
        "fields": "id,username,followers_count,follows_count,media_count"
    })
    print(f"  @{account.get('username')} | {account.get('followers_count')} followers")

    # Fetch daily insights for the last 30 days
    # The API returns daily breakdowns when using since/until with period=day
    since = now - timedelta(days=30)
    since_ts = int(since.timestamp())
    until_ts = int(now.timestamp())

    metrics_to_fetch = ["reach", "follower_count", "profile_views", "accounts_engaged"]

    print(f"Fetching daily insights from {since.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')}...")

    daily_data = {}

    for metric in metrics_to_fetch:
        print(f"  -> {metric}...")
        try:
            data = api_get(f"/{user_id}/insights", {
                "metric": metric,
                "period": "day",
                "since": str(since_ts),
                "until": str(until_ts),
            })

            if "data" in data:
                for metric_entry in data["data"]:
                    name = metric_entry["name"]
                    for val in metric_entry.get("values", []):
                        end_time = val.get("end_time", "")
                        date_str = end_time[:10]
                        if date_str not in daily_data:
                            daily_data[date_str] = {}
                        daily_data[date_str][name] = val.get("value", 0)
        except Exception as e:
            print(f"  Warning: Failed to fetch {metric}: {e}")

    # Build daily entries
    daily_entries = []
    current_followers = account.get("followers_count", 0)

    # Sort dates
    sorted_dates = sorted(daily_data.keys())

    for date_str in sorted_dates:
        d = daily_data[date_str]
        entry = {
            "date": date_str,
            "followers_count": d.get("follower_count", current_followers),
            "reach": d.get("reach", 0),
            "profile_views": d.get("profile_views", 0),
            "accounts_engaged": d.get("accounts_engaged", 0),
        }
        daily_entries.append(entry)

    # Load existing metrics.json and merge
    metrics_path = DATA_DIR / "metrics.json"
    if metrics_path.exists():
        with open(metrics_path, "r", encoding="utf-8") as f:
            metrics = json.load(f)
    else:
        metrics = {"last_updated": None, "account": {}, "daily": []}

    # Merge: keep existing entries, add/update from backfill
    existing = {d["date"]: d for d in metrics.get("daily", [])}
    for entry in daily_entries:
        existing[entry["date"]] = entry

    metrics["daily"] = sorted(existing.values(), key=lambda d: d["date"])[-90:]
    metrics["last_updated"] = now.isoformat()
    metrics["account"] = {
        "id": account.get("id"),
        "username": account.get("username"),
        "followers_count": account.get("followers_count"),
        "follows_count": account.get("follows_count"),
        "media_count": account.get("media_count"),
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    print(f"\nDone! {len(metrics['daily'])} daily entries saved to {metrics_path}")


if __name__ == "__main__":
    main()
