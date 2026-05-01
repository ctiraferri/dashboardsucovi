"""
fetch_metrics.py - Fetches Instagram metrics via the Instagram API.

Usage:
  python fetch_metrics.py

Required environment variables:
  IG_ACCESS_TOKEN  - Instagram API access token (starts with IGAA)
  IG_USER_ID       - Instagram Business Account ID (numeric)

Output:
  Updates data/metrics.json and data/posts.json with latest data.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

BASE_URL = "https://graph.instagram.com/v21.0"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def api_get(endpoint, params=None):
    """Make a GET request to the Instagram API."""
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
    except URLError as e:
        print(f"Network error: {e.reason}")
        sys.exit(1)


def get_account_info(user_id):
    """Get basic account information."""
    data = api_get(f"/{user_id}", {
        "fields": "id,username,followers_count,follows_count,media_count"
    })
    return data


def get_account_insights(user_id):
    """Get account-level insights for the current day."""
    data = api_get(f"/{user_id}/insights", {
        "metric": "reach,follower_count,profile_views,accounts_engaged",
        "period": "day",
        "metric_type": "total_value",
    })

    result = {}
    if "data" in data:
        for metric in data["data"]:
            name = metric["name"]
            total = metric.get("total_value", {})
            result[name] = total.get("value", 0)

    return result


def get_recent_media(user_id, limit=25):
    """Get recent media with per-post insights."""
    media_data = api_get(f"/{user_id}/media", {
        "fields": "id,caption,media_type,timestamp,permalink,like_count,comments_count",
        "limit": str(limit),
    })

    posts = []
    for item in media_data.get("data", []):
        post = {
            "id": item["id"],
            "caption": item.get("caption", ""),
            "media_type": item.get("media_type", ""),
            "timestamp": item.get("timestamp", ""),
            "permalink": item.get("permalink", ""),
            "like_count": item.get("like_count", 0),
            "comments_count": item.get("comments_count", 0),
        }

        # Get per-post insights (reach, saved, likes, comments, shares)
        try:
            insights = api_get(f"/{item['id']}/insights", {
                "metric": "reach,saved,likes,comments,shares",
            })
            for metric in insights.get("data", []):
                post[metric["name"]] = metric["values"][0]["value"]
        except Exception as e:
            print(f"  Warning: Could not get insights for post {item['id']}: {e}")

        # Calculate engagement rate based on reach
        total_engagement = (
            post.get("like_count", 0)
            + post.get("comments_count", 0)
            + post.get("saved", 0)
            + post.get("shares", 0)
        )
        if post.get("reach", 0) > 0:
            post["engagement_rate"] = round((total_engagement / post["reach"]) * 100, 2)
        else:
            post["engagement_rate"] = 0

        posts.append(post)

    return posts


def load_json(filepath):
    """Load existing JSON file or return empty structure."""
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_json(filepath, data):
    """Save data to JSON file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved: {filepath}")


def update_metrics():
    """Main function to fetch and update all metrics."""
    user_id = os.environ.get("IG_USER_ID")
    if not user_id:
        print("ERROR: IG_USER_ID not set")
        sys.exit(1)

    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    print(f"Fetching metrics for {today}...")

    # 1. Account info
    print("  -> Account info...")
    account = get_account_info(user_id)
    print(f"     @{account.get('username')} | {account.get('followers_count')} followers")

    # 2. Daily insights
    print("  -> Account insights...")
    insights = get_account_insights(user_id)
    print(f"     Reach: {insights.get('reach', 0)} | Profile views: {insights.get('profile_views', 0)}")

    # 3. Update metrics.json
    metrics_path = DATA_DIR / "metrics.json"
    metrics = load_json(metrics_path) or {"last_updated": None, "account": {}, "daily": []}

    metrics["last_updated"] = now.isoformat()
    metrics["account"] = {
        "id": account.get("id"),
        "username": account.get("username"),
        "followers_count": account.get("followers_count"),
        "follows_count": account.get("follows_count"),
        "media_count": account.get("media_count"),
    }

    # Build today's entry
    daily_entry = {
        "date": today,
        "followers_count": account.get("followers_count", 0),
        "reach": insights.get("reach", 0),
        "profile_views": insights.get("profile_views", 0),
        "accounts_engaged": insights.get("accounts_engaged", 0),
    }

    # Replace today's entry if it exists, otherwise append
    existing_dates = {d["date"]: i for i, d in enumerate(metrics["daily"])}
    if today in existing_dates:
        metrics["daily"][existing_dates[today]] = daily_entry
    else:
        metrics["daily"].append(daily_entry)

    # Keep last 90 days of data
    metrics["daily"] = sorted(metrics["daily"], key=lambda d: d["date"])[-90:]

    save_json(metrics_path, metrics)

    # 4. Fetch and update posts
    print("  -> Recent posts...")
    posts = get_recent_media(user_id)

    posts_path = DATA_DIR / "posts.json"
    posts_data = {
        "last_updated": now.isoformat(),
        "posts": posts,
    }
    save_json(posts_path, posts_data)

    print(f"\nDone! {len(metrics['daily'])} daily entries, {len(posts)} posts fetched.")


if __name__ == "__main__":
    update_metrics()
