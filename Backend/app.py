import base64
import json
import os
from urllib.parse import quote

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from google import genai
from google.genai import types

app = Flask(__name__)
CORS(app)

# Keys come from environment variables - never hardcode them.
#   Windows (PowerShell):  $env:MURF_API_KEY="..." ; $env:GEMINI_API_KEY="..."
#   Mac/Linux:             export MURF_API_KEY="..." ; export GEMINI_API_KEY="..."
MURF_API_KEY = os.environ.get("MURF_API_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
GEMINI_MODEL = "gemini-3.1-flash-lite"

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
WIKI_HEADERS = {"User-Agent": "TravelGuideApp/1.0 (student project)"}

PROMPTS = {
    "Summary": """
You are a professional tourist guide.
Provide a high-level overview of "{place}" in {language}.

Focus on:
- The historical significance
- Why the place is famous
- Key architectural or cultural highlights

Keep the explanation concise, engaging, and easy to follow.
Avoid excessive details and dates.
Limit the response to around 200 words.

Respond ONLY in {language}.
""",
    "Detailed": """
You are a professional tourist guide.
Provide a detailed and immersive explanation of "{place}" in {language}.

Cover:
- Historical background and timeline
- Architectural design and unique features
- Cultural importance and notable events
- Interesting facts and visitor insights

Explain concepts clearly and in a storytelling manner.
Include relevant details and examples to create a rich experience.
Limit the response to around 400 words.

Respond ONLY in {language}.
""",
}

# Simple in-memory cache: same place/language/length/voice = instant + saves API credits
GUIDE_CACHE = {}


# ---------- Helpers ----------

def generate_description(place, answer_type, language):
    prompt = PROMPTS[answer_type].format(place=place, language=language)
    response = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
    return response.text


def generate_speech(text, voice_id, locale):
    """Returns MP3 bytes from Murf. Raises RuntimeError if Murf fails."""
    url = "https://global.api.murf.ai/v1/speech/stream"
    headers = {"api-key": MURF_API_KEY, "Content-Type": "application/json"}
    data = {
        "voice_id": voice_id,
        "text": text,
        "locale": locale,
        "model": "FALCON",
        "format": "MP3",
        "sampleRate": 24000,
        "channelType": "MONO",
    }
    response = requests.post(url, headers=headers, json=data, timeout=120)
    if response.status_code != 200:
        raise RuntimeError(f"Murf error {response.status_code}: {response.text[:200]}")
    return response.content


# ---------- Routes ----------

@app.route("/search-place", methods=["GET"])
def search_place():
    """Search any destination and return its name, short description and photo."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Please type a destination to search."}), 400

    try:
        search = requests.get(
            WIKI_API,
            params={
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": 1,
                "format": "json",
            },
            headers=WIKI_HEADERS,
            timeout=10,
        ).json()

        results = search.get("query", {}).get("search", [])
        if not results:
            return jsonify({"error": f'No place found for "{query}". Try another name.'}), 404

        title = results[0]["title"]
        summary = requests.get(
            WIKI_SUMMARY + quote(title.replace(" ", "_"), safe=""),
            headers=WIKI_HEADERS,
            timeout=10,
        ).json()

        image = (summary.get("originalimage") or summary.get("thumbnail") or {}).get("source", "")
        return jsonify({
            "name": summary.get("title", title),
            "description": summary.get("description", ""),
            "image": image,
        })
    except Exception as exc:
        print("Search error:", exc)
        return jsonify({"error": "Search failed. Please try again."}), 502


@app.route("/generate-audio-guide", methods=["POST"])
def generate_audio_guide():
    data = request.get_json(silent=True) or {}
    try:
        place = data["place"]
        answer_type = data["answerType"]
        language = data["language"]
        voice_id = data["voiceId"]
        locale = data["locale"]
    except KeyError as missing:
        return jsonify({"error": f"Missing field: {missing}"}), 400

    if answer_type not in PROMPTS:
        return jsonify({"error": "Invalid answerType"}), 400

    cache_key = (place, answer_type, language, voice_id)
    if cache_key in GUIDE_CACHE:
        return jsonify(GUIDE_CACHE[cache_key])

    missing_keys = [
        key_name
        for key_name, key in (
            ("GEMINI_API_KEY", GEMINI_API_KEY),
            ("MURF_API_KEY", MURF_API_KEY),
        )
        if not key
    ]
    if missing_keys:
        return jsonify({
            "error": f"Set {', '.join(missing_keys)} to generate an audio guide."
        }), 503

    try:
        text_description = generate_description(place, answer_type, language)
        audio_bytes = generate_speech(text_description, voice_id, locale)
    except Exception as exc:
        print("Generation error:", exc)
        return jsonify({"error": "Could not generate the audio guide. Please try again."}), 502

    result = {
        "description": text_description,
        "audioBase64": base64.b64encode(audio_bytes).decode("utf-8"),
    }
    GUIDE_CACHE[cache_key] = result
    return jsonify(result)


@app.route("/generate-itinerary", methods=["POST"])
def generate_itinerary():
    """Create a day-by-day plan. Every stop can then be opened as an audio guide."""
    data = request.get_json(silent=True) or {}
    destination = (data.get("destination") or "").strip()
    if not destination:
        return jsonify({"error": "Please enter a destination."}), 400

    try:
        days = max(1, min(int(data.get("days", 2)), 5))
    except (TypeError, ValueError):
        days = 2

    if not GEMINI_API_KEY:
        return jsonify({
            "error": "Set GEMINI_API_KEY to generate an itinerary."
        }), 503

    prompt = f"""You are an expert travel planner.
Create a {days}-day sightseeing itinerary for "{destination}".

Return ONLY valid JSON in exactly this shape:
{{
  "title": "short trip title",
  "days": [
    {{
      "day": 1,
      "theme": "short theme for the day",
      "stops": [
        {{"name": "Exact well-known place name", "tip": "One practical visitor tip, max 15 words"}}
      ]
    }}
  ]
}}

Rules:
- Exactly {days} entries in "days".
- 3 or 4 stops per day, real tourist places, ordered so they are close to each other.
- "name" must be the plain place name only (no numbering, no city suffix).
"""

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        plan = json.loads(response.text)
        if "days" not in plan:
            raise ValueError("Bad itinerary format")
        return jsonify(plan)
    except Exception as exc:
        print("Itinerary error:", exc)
        return jsonify({"error": "Could not build the itinerary. Please try again."}), 502


if __name__ == "__main__":
    app.run(debug=True, port=5001)