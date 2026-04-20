"""
auto_forward.py — מעביר הקלטות מה-chat-עצמי לאליעזר ולקבוצת קלוד קוד.
הרץ ברקע: python C:/MCP_WhatsApp/auto_forward.py
"""

import httpx
import json
import time
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    handlers=[
        logging.FileHandler(Path(__file__).parent / "auto_forward.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)

BASE_URL = "http://elitzur.ddns.net:1000"
HEADERS = {"x-api-key": "a17d2A17d2"}

SELF_CHAT_ID = "213021905449039@lid"   # צ'אט עצמי
ELIEZER_CHAT  = "972559571223@c.us"    # אליעזר בן יהודה
GROUP_CHAT_ID = "120363425634481122@g.us"  # קלוד קוד

# סוגי הודעות שיועברו (הקלטות)
VOICE_TYPES = {"audio", "ptt", "voice"}

STATE_FILE = Path(__file__).parent / "auto_forward_state.json"
POLL_INTERVAL = 15  # שניות


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"last_timestamp": 0, "processed": []}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")


def get_messages(client: httpx.Client) -> list:
    r = client.get(
        f"{BASE_URL}/chats/{SELF_CHAT_ID}/messages",
        headers=HEADERS,
        params={"limit": 30},
        timeout=15,
    )
    data = r.json()
    return data.get("messages", []) if data.get("ok") else []


def forward_to(client: httpx.Client, msg_id: str, to_chat: str) -> dict:
    r = client.post(
        f"{BASE_URL}/messages/{msg_id}/forward",
        headers=HEADERS,
        json={"toPhone": to_chat},
        timeout=20,
    )
    return r.json()


def main() -> None:
    state = load_state()
    logging.info("Auto-forwarder started. last_timestamp=%s", state["last_timestamp"])

    with httpx.Client() as client:
        while True:
            try:
                messages = get_messages(client)
                new_msgs = [
                    m for m in messages
                    if m.get("fromMe")
                    and m.get("type") in VOICE_TYPES
                    and m.get("timestamp", 0) > state["last_timestamp"]
                    and m["id"]["_serialized"] not in state["processed"]
                ]

                for msg in new_msgs:
                    mid = msg["id"]["_serialized"]
                    ts  = msg.get("timestamp", 0)
                    logging.info("New recording %s (type=%s, ts=%s)", mid, msg.get("type"), ts)

                    r1 = forward_to(client, mid, ELIEZER_CHAT)
                    logging.info("  → אליעזר: %s", r1.get("ok"))

                    r2 = forward_to(client, mid, GROUP_CHAT_ID)
                    logging.info("  → קלוד קוד: %s", r2.get("ok"))

                    state["processed"].append(mid)
                    if ts > state["last_timestamp"]:
                        state["last_timestamp"] = ts

                state["processed"] = state["processed"][-200:]
                save_state(state)

            except Exception as exc:
                logging.error("Error: %s", exc)

            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
