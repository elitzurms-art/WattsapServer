"""
claude_listener.py — מאזין לקבוצת "קלוד קוד" ומריץ Claude Code מקומית.
הרץ ברקע: python C:/MCP_WhatsApp/claude_listener.py
"""

import base64
import httpx
import json
import subprocess
import time
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    handlers=[
        logging.FileHandler(Path(__file__).parent / "claude_listener.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)

BASE_URL      = "http://elitzur.ddns.net:1000"
HEADERS       = {"x-api-key": "a17d2A17d2"}
GROUP_ID      = "120363425634481122@g.us"
DEFAULT_DIR   = r"C:\navigate"
POLL_INTERVAL = 15
TTS_VOICE     = "he-IL-HilaNeural"

STATE_FILE = Path(__file__).parent / "claude_listener_state.json"

HELP_MESSAGE = """\
שלום משה, מה תרצה לעשות היום? אלה האפשרויות:

📁 C:\\path  או  /dir C:\\path — מחליף תיקיית עבודה
🪟  או  /new [args] — פותח חלון claude אינטראקטיבי
/new resume — בחירת סשן קיים
/new continue — ממשיך סשן אחרון
/new rename — שינוי שם סשן
תשובה מלאה — שולח פלט מלא של הריצה האחרונה כקובץ txt
דיבוב פעיל / דיבוב כבוי — toggle תשובות קוליות

כל הודעה אחרת → claude --print + תשובה קולית"""

GREETINGS = {"שלום", "הי", "היי"}

DIR_PREFIXES  = ("📁", "/dir ", "/cd ")
WIN_PREFIXES  = ("🪟", "/new", "/window")


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {
        "last_timestamp": int(time.time()),
        "processed": [],
        "work_dir": DEFAULT_DIR,
        "voice": True,
        "last_full_output": "",
    }


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")


def get_last_group_message(client: httpx.Client) -> dict | None:
    """מחזיר את ההודעה האחרונה בקבוצת קלוד קוד דרך רשימת הצ'אטים."""
    r = client.get(f"{BASE_URL}/chats", headers=HEADERS, params={"limit": 10}, timeout=25)
    data = r.json()
    if not data.get("ok"):
        return None
    for chat in data.get("chats", []):
        if chat.get("id") == GROUP_ID:
            return chat.get("lastMessage")
    return None


def send_text(client: httpx.Client, message: str, sent_ids: set) -> None:
    MAX = 60_000
    for chunk in [message[i:i+MAX] for i in range(0, len(message), MAX)]:
        r = client.post(f"{BASE_URL}/send", headers=HEADERS,
                        json={"phone": GROUP_ID, "message": chunk}, timeout=20)
        mid = r.json().get("id")
        if mid:
            sent_ids.add(mid)


def send_voice(client: httpx.Client, text: str, sent_ids: set) -> bool:
    """שולח טקסט לבוט שמייצר הודעה קולית. מחזיר True אם הצליח."""
    try:
        r = client.post(
            f"{BASE_URL}/send/tts",
            headers=HEADERS,
            json={"phone": GROUP_ID, "text": text, "voice": TTS_VOICE},
            timeout=60,
        )
        data = r.json()
        if data.get("id"):
            sent_ids.add(data["id"])
        return data.get("ok", False)
    except Exception as exc:
        logging.error("שגיאת TTS: %s", exc)
        return False


def send_full_output_file(client: httpx.Client, output: str, sent_ids: set) -> None:
    if not output:
        send_text(client, "❌ אין פלט שמור מהריצה האחרונה.", sent_ids)
        return
    b64 = base64.b64encode(output.encode("utf-8")).decode()
    r = client.post(
        f"{BASE_URL}/send/document",
        headers=HEADERS,
        json={
            "phone": GROUP_ID,
            "documentBase64": b64,
            "mimetype": "text/plain",
            "filename": "claude_output.txt",
            "caption": "הפלט המלא של הריצה האחרונה",
        },
        timeout=30,
    )
    data = r.json()
    if data.get("id"):
        sent_ids.add(data["id"])
    if not data.get("ok"):
        send_text(client, output, sent_ids)


def run_claude_print(task: str, work_dir: str) -> str:
    logging.info("claude --print מתוך %s: %s", work_dir, task[:80])
    try:
        result = subprocess.run(
            ["claude", "--print", task],
            cwd=work_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=300,
        )
        return result.stdout.strip() or result.stderr.strip() or "(אין פלט)"
    except subprocess.TimeoutExpired:
        return "⏰ Claude לא השלים תוך 5 דקות."
    except FileNotFoundError:
        return "❌ פקודת claude לא נמצאה — ודא ש-Claude Code מותקן ב-PATH."
    except Exception as exc:
        return f"❌ שגיאה: {exc}"


def open_claude_window(args: str, work_dir: str) -> None:
    cmd_str = "claude" + (" " + args if args else "")
    logging.info("פותח חלון: %s ב-%s", cmd_str, work_dir)
    subprocess.Popen(
        ["cmd", "/c", "start", "Claude Code", "/k",
         f"cd /d \"{work_dir}\" && {cmd_str}"],
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )


def handle_message(client: httpx.Client, body: str, state: dict, sent_ids: set) -> None:
    text = body.strip()

    # ברכה
    if text in GREETINGS:
        send_text(client, HELP_MESSAGE, sent_ids)
        return

    # תשובה מלאה כקובץ
    if text in ("תן לי תשובה מלאה", "תשובה מלאה"):
        send_full_output_file(client, state.get("last_full_output", ""), sent_ids)
        return

    # toggle דיבוב
    if text in ("הפעל דיבוב", "דיבוב פעיל"):
        state["voice"] = True
        send_text(client, "🔊 דיבוב הופעל", sent_ids)
        return
    if text in ("כבה דיבוב", "דיבוב כבוי"):
        state["voice"] = False
        send_text(client, "💬 דיבוב כובה", sent_ids)
        return

    # החלפת תיקייה
    import re
    if any(text.startswith(p) for p in DIR_PREFIXES) or re.match(r'^[A-Za-z]:\\', text):
        prefix = next((p for p in DIR_PREFIXES if text.startswith(p)), "")
        new_dir = text[len(prefix):].strip()
        if Path(new_dir).is_dir():
            state["work_dir"] = new_dir
            send_text(client, f"✅ תיקיית עבודה: {new_dir}", sent_ids)
        else:
            send_text(client, f"❌ תיקייה לא קיימת: {new_dir}", sent_ids)
        return

    # פתיחת חלון אינטראקטיבי
    if any(text.startswith(p) for p in WIN_PREFIXES):
        prefix = next(p for p in WIN_PREFIXES if text.startswith(p))
        args = text[len(prefix):].strip()
        open_claude_window(args, state["work_dir"])
        send_text(client, f"🪟 פתחתי חלון claude{' ' + args if args else ''} ב-{state['work_dir']}", sent_ids)
        return

    # כל שאר ההודעות — claude --print
    response = run_claude_print(text, state["work_dir"])
    state["last_full_output"] = response

    if state.get("voice", True):
        success = send_voice(client, response, sent_ids)
        if not success:
            send_text(client, response, sent_ids)
    else:
        send_text(client, response, sent_ids)


def main() -> None:
    state = load_state()
    sent_ids: set = set()  # IDs שהlistener עצמו שלח — לא לעבד
    logging.info("Claude Listener started. dir=%s voice=%s", state["work_dir"], state.get("voice"))

    with httpx.Client() as client:
        while True:
            try:
                msg = get_last_group_message(client)
                if (
                    msg
                    and msg.get("timestamp", 0) > state["last_timestamp"]
                    and msg.get("id") not in state["processed"]
                    and msg.get("id") not in sent_ids
                    and msg.get("body", "").strip()
                ):
                    mid = msg.get("id", "")
                    ts  = msg.get("timestamp", 0)
                    handle_message(client, msg["body"], state, sent_ids)
                    state["processed"].append(mid)
                    state["last_timestamp"] = ts
                    state["processed"] = state["processed"][-100:]
                    save_state(state)

            except Exception as exc:
                logging.error("שגיאה: %s", exc)

            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
