import json
import time
import urllib.request
import urllib.parse
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from icalendar import Calendar

app = Flask(__name__)

GEOCODE_URL = "https://nominatim.openstreetmap.org/search"
GEOCODE_CACHE_FILE = Path("geocode_cache.json")


def load_cache():
    if GEOCODE_CACHE_FILE.exists():
        with open(GEOCODE_CACHE_FILE) as f:
            return json.load(f)
    return {}


def save_cache(cache):
    with open(GEOCODE_CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


def geocode_location(location: str, cache: dict) -> dict | None:
    """Convert a location string to lat/lon using Nominatim."""
    if location in cache:
        return cache[location]

    params = urllib.parse.urlencode({
        "q": location,
        "format": "json",
        "limit": 1,
    })
    url = f"{GEOCODE_URL}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "AppleCalendarMapApp/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            results = json.loads(resp.read().decode())
        if results:
            result = {"lat": float(results[0]["lat"]), "lon": float(results[0]["lon"]), "display_name": results[0]["display_name"]}
            cache[location] = result
            save_cache(cache)
            time.sleep(1)  # Nominatim rate limit: 1 req/sec
            return result
    except Exception:
        pass
    cache[location] = None
    save_cache(cache)
    return None


def parse_calendar(ics_bytes: bytes) -> list[dict]:
    """Parse an .ics file and extract events with locations."""
    cal = Calendar.from_ical(ics_bytes)
    events = []
    for component in cal.walk():
        if component.name != "VEVENT":
            continue
        location = str(component.get("LOCATION", "")).strip()
        if not location:
            continue
        summary = str(component.get("SUMMARY", "No Title")).strip()
        dtstart = component.get("DTSTART")
        date_str = ""
        if dtstart:
            dt = dtstart.dt
            date_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)
        events.append({"summary": summary, "location": location, "date": date_str})
    return events


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/process", methods=["POST"])
def process():
    if "calendar" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["calendar"]
    if not file.filename.endswith(".ics"):
        return jsonify({"error": "Please upload a .ics file"}), 400

    ics_bytes = file.read()
    events = parse_calendar(ics_bytes)

    if not events:
        return jsonify({"error": "No events with locations found in this calendar"}), 400

    cache = load_cache()
    results = []
    unique_locations = {}

    for event in events:
        loc = event["location"]
        if loc not in unique_locations:
            unique_locations[loc] = geocode_location(loc, cache)

        geo = unique_locations[loc]
        results.append({
            "summary": event["summary"],
            "location": loc,
            "date": event["date"],
            "lat": geo["lat"] if geo else None,
            "lon": geo["lon"] if geo else None,
            "display_name": geo["display_name"] if geo else None,
            "geocoded": geo is not None,
        })

    geocoded = sum(1 for r in results if r["geocoded"])
    return jsonify({
        "events": results,
        "total": len(results),
        "geocoded": geocoded,
        "failed": len(results) - geocoded,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
