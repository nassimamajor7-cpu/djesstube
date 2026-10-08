"""DjessTube – API Flask.

Fonctionne dans deux modes avec le même code :
  * cloud (Vercel)  : recherche, suggestions, infos vidéo  (stdlib uniquement)
  * local           : + téléchargement MP3/MP4 et lecture directe via yt-dlp + ffmpeg
Le mode local s'active tout seul si yt-dlp est installé (pip install -r requirements-local.txt).
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

from flask import Flask, jsonify, redirect, request, send_from_directory

BASE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(BASE, "public")
ON_VERCEL = bool(os.environ.get("VERCEL"))

try:
    if ON_VERCEL:
        raise ImportError
    import yt_dlp
    import imageio_ffmpeg
    HAS_YTDLP = True
except ImportError:
    HAS_YTDLP = False

app = Flask(__name__, static_folder=None)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
_cache = {}


def cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    if len(_cache) > 500:
        _cache.pop(next(iter(_cache)))
    return val


def http_get(url, timeout=10):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Cookie": "CONSENT=YES+1; SOCS=CAI",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def extract_json(html, marker):
    i = html.find(marker)
    if i < 0:
        return None
    j = html.find("{", i)
    try:
        return json.JSONDecoder().raw_decode(html[j:])[0]
    except ValueError:
        return None


def find_all(node, key, out):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == key:
                out.append(v)
            else:
                find_all(v, key, out)
    elif isinstance(node, list):
        for v in node:
            find_all(v, key, out)
    return out


def parse_duration(s):
    if not s:
        return None
    n = 0
    for p in s.split(":"):
        n = n * 60 + int(p)
    return n


def text_of(o):
    if not o:
        return ""
    return o.get("simpleText") or "".join(r.get("text", "") for r in o.get("runs", []))


def thumb(vid):
    return f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"


def yt_search(q):
    url = "https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": q, "sp": "EgIQAQ==", "hl": "fr"})
    data = extract_json(http_get(url), "ytInitialData")
    out = []
    for v in find_all(data or {}, "videoRenderer", []):
        vid = v.get("videoId")
        if not vid:
            continue
        try:
            dur = parse_duration(text_of(v.get("lengthText")))
        except ValueError:
            dur = None
        out.append({
            "id": vid, "title": text_of(v.get("title")),
            "channel": text_of(v.get("ownerText")) or text_of(v.get("longBylineText")),
            "duration": dur, "live": dur is None,
            "views": text_of(v.get("viewCountText")), "published": text_of(v.get("publishedTimeText")),
            "thumb": thumb(vid),
        })
    return out


YT_ID = re.compile(r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/|v/))([\w-]{11})")


def yt_info(vid):
    html = http_get(f"https://www.youtube.com/watch?v={vid}&hl=fr")
    pr = extract_json(html, "ytInitialPlayerResponse") or {}
    d = pr.get("videoDetails")
    if d:
        return {
            "id": vid, "title": d.get("title"), "channel": d.get("author"),
            "duration": int(d.get("lengthSeconds") or 0) or None,
            "views": int(d["viewCount"]) if d.get("viewCount") else None,
            "description": (d.get("shortDescription") or "")[:4000], "thumb": thumb(vid),
            "url": f"https://www.youtube.com/watch?v={vid}", "youtube": True,
            "live": bool(d.get("isLiveContent")) and not d.get("lengthSeconds"),
        }
    o = json.loads(http_get("https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}")))
    return {"id": vid, "title": o["title"], "channel": o["author_name"], "thumb": thumb(vid),
            "url": f"https://www.youtube.com/watch?v={vid}", "youtube": True, "description": ""}


# ---------------------------------------------------------------- routes
@app.after_request
def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


@app.route("/")
def index():
    return send_from_directory(PUBLIC, "index.html")


@app.route("/<path:p>")
def static_files(p):
    return send_from_directory(PUBLIC, p)


@app.route("/api/capabilities")
def capabilities():
    return jsonify({"download": HAS_YTDLP, "mode": "local" if HAS_YTDLP else "cloud"})


@app.route("/api/search")
def search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    try:
        res = cached(("s", q.lower()), 600, lambda: yt_search(q))
        if not res and HAS_YTDLP:
            with yt_dlp.YoutubeDL({"quiet": True, "extract_flat": True}) as ydl:
                info = ydl.extract_info(f"ytsearch24:{q}", download=False)
            res = [{"id": e["id"], "title": e.get("title"), "channel": e.get("channel") or e.get("uploader"),
                    "duration": e.get("duration"), "views": e.get("view_count"), "thumb": thumb(e["id"])}
                   for e in info.get("entries", []) if e]
    except Exception as ex:
        return jsonify({"error": str(ex)}), 502
    r = jsonify(res)
    r.headers["Cache-Control"] = "public, s-maxage=600, stale-while-revalidate=3600"
    return r


@app.route("/api/suggest")
def suggest():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    try:
        raw = http_get("https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=fr&q=" + urllib.parse.quote(q), 5)
        out = json.loads(raw)[1][:8]
    except Exception:
        out = []
    r = jsonify(out)
    r.headers["Cache-Control"] = "public, s-maxage=3600"
    return r


@app.route("/api/info")
def info():
    url = request.args.get("url", "").strip()
    vid = request.args.get("id") or (YT_ID.search(url).group(1) if YT_ID.search(url) else None)
    try:
        if vid:
            res = cached(("i", vid), 1800, lambda: yt_info(vid))
        elif HAS_YTDLP:
            with yt_dlp.YoutubeDL({"quiet": True, "noplaylist": True}) as ydl:
                i = ydl.extract_info(url if url.startswith("http") else "https://" + url, download=False)
            res = {"id": i.get("id"), "title": i.get("title"), "channel": i.get("channel") or i.get("uploader"),
                   "duration": i.get("duration"), "views": i.get("view_count"), "description": (i.get("description") or "")[:4000],
                   "thumb": i.get("thumbnail"), "url": i.get("webpage_url") or url, "youtube": False}
        else:
            return jsonify({"error": "Seuls les liens YouTube sont pris en charge en ligne. Lance DjessTube en local pour les autres sites."}), 400
    except Exception as ex:
        return jsonify({"error": re.sub(r"\x1b\[[0-9;]*m", "", str(ex))}), 400
    r = jsonify(res)
    r.headers["Cache-Control"] = "public, s-maxage=1800"
    return r


# ---------------------------------------------------------------- téléchargement « cloud » (sans yt-dlp)
# Le serveur résout les liens directs (clients mobiles de YouTube) et les relaie par morceaux de 3 Mo
# (limite des fonctions serverless). Le navigateur assemble, convertit en MP3 et fusionne le HD.
CLIENTS = [
    {"clientName": "ANDROID_VR", "clientVersion": "1.60.19", "deviceMake": "Oculus", "deviceModel": "Quest 3",
     "androidSdkVersion": 32, "osName": "Android", "osVersion": "12L", "hl": "fr",
     "userAgent": "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip"},
    {"clientName": "ANDROID", "clientVersion": "20.10.38", "androidSdkVersion": 30, "osName": "Android", "osVersion": "11", "hl": "fr",
     "userAgent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip"},
    {"clientName": "IOS", "clientVersion": "20.10.4", "deviceMake": "Apple", "deviceModel": "iPhone16,2", "osName": "iPhone",
     "osVersion": "18.3.2.22D82", "hl": "fr",
     "userAgent": "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)"},
]
CHUNK = 3_000_000


def _player_call(vid, client):
    body = {"videoId": vid, "contentCheckOk": True, "racyCheckOk": True, "context": {"client": client}}
    req = urllib.request.Request("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "User-Agent": client["userAgent"]})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def _resolve_submagic(vid):
    """Fallback public : submagic retourne des URLs googlevideo lues depuis leur propre IP, utilisables partout."""
    body = json.dumps({"url": f"https://youtu.be/{vid}"}).encode()
    req = urllib.request.Request("https://submagic-free-tools.fly.dev/api/youtube-info", body,
                                 {"Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA, "Origin": "https://submagic-free-tools.fly.dev"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.load(r)
    out = {}
    for f in d.get("formats") or []:
        itag = int(f.get("formatId") or 0); u = f.get("url")
        if not itag or not u:
            continue
        kind = f.get("type") or ""
        has_a = kind in ("audio", "video_with_audio")
        has_v = kind in ("video_only", "video_with_audio")
        mime = ("audio/" if kind == "audio" else "video/") + (f.get("ext") or "mp4")
        if f.get("ext") == "m4a":
            mime = "audio/mp4"
        out[itag] = {
            "itag": itag, "url": u, "mimeType": mime + (';codecs="avc1"' if has_v and f.get("ext") == "mp4" and has_a is False else ""),
            "height": f.get("height"), "contentLength": None,
            "bitrate": {140: 128000, 141: 256000, 139: 48000, 249: 50000, 250: 70000, 251: 160000}.get(itag),
            "_type": kind,
        }
    return out


def resolve(vid, fresh=False):
    """Retourne {formats:{itag:fmt}, ua} avec des URLs directes. Plusieurs clients essayés + fallback public."""
    if not fresh:
        hit = _cache.get(("p", vid))
        if hit and time.time() - hit[0] < 240:
            return hit[1]
    fmts, ua, reason = {}, None, "Vidéo indisponible"
    for c in CLIENTS:
        try:
            r = _player_call(vid, c)
        except Exception as ex:
            reason = str(ex)
            continue
        st = r.get("streamingData") or {}
        status = (r.get("playabilityStatus") or {}).get("status")
        if status == "LOGIN_REQUIRED":
            reason = "Connectez-vous pour confirmer que vous n'êtes pas un robot"
            continue
        got = [f for f in st.get("formats", []) + st.get("adaptiveFormats", []) if f.get("url")]
        if not got:
            reason = (r.get("playabilityStatus") or {}).get("reason") or reason
            continue
        if ua is None:
            ua = c["userAgent"]
        if c["userAgent"] != ua:
            continue
        for f in got:
            fmts.setdefault(f["itag"], f)
        if fmts.get(18) or len(fmts) > 3:
            break
    if not fmts:
        # YouTube bloque cette IP (classique sur Vercel) : on passe par submagic qui proxy depuis ses propres IPs.
        try:
            fmts = _resolve_submagic(vid); ua = UA
        except Exception as ex:
            raise RuntimeError(f"{reason} — proxy indisponible ({ex})")
        if not fmts:
            raise RuntimeError(reason)
    res = {"formats": fmts, "ua": ua}
    _cache[("p", vid)] = (time.time(), res)
    return res


@app.route("/api/formats")
def formats():
    vid = request.args.get("id", "")
    try:
        res = resolve(vid)
    except Exception as ex:
        return jsonify({"error": str(ex)}), 502
    F = res["formats"].values()

    def size(f):
        return int(f["contentLength"]) if f.get("contentLength") else None

    audio = [f for f in F if f["mimeType"].startswith("audio/mp4")]
    audio.sort(key=lambda f: f.get("bitrate", 0), reverse=True)
    muxed = next((f for f in F if f["itag"] == 18), None)
    vids = {}
    for f in F:
        if f["mimeType"].startswith("video/mp4") and "avc1" in f["mimeType"] and "mp4a" not in f["mimeType"] and f.get("height"):
            vids.setdefault(f["height"], f)
    out = {
        "audio": {"itag": audio[0]["itag"], "size": size(audio[0])} if audio else None,
        "muxed": {"itag": 18, "height": 360, "size": size(muxed)} if muxed else None,
        "video": [{"itag": f["itag"], "height": h, "size": size(f)} for h, f in sorted(vids.items(), reverse=True)],
    }
    r = jsonify(out)
    r.headers["Cache-Control"] = "no-store"
    return r


@app.route("/api/media")
def media():
    """Relaie le flux par morceaux. Utilisé pour la conversion MP3 côté navigateur, qui a besoin
    des bytes bruts. Si l'IP du serveur est bloquée par Google (fréquent sur Vercel), ça renvoie 502
    et le front bascule sur /api/direct pour un téléchargement direct depuis l'IP du visiteur."""
    vid, itag = request.args.get("id", ""), request.args.get("itag", type=int)
    start = max(request.args.get("start", 0, type=int), 0)
    for attempt in (0, 1):
        try:
            res = resolve(vid, fresh=bool(attempt))
            f = res["formats"].get(itag)
            if not f:
                return jsonify({"error": "format introuvable"}), 404
            req = urllib.request.Request(f["url"], headers={"User-Agent": res["ua"], "Range": f"bytes={start}-{start + CHUNK - 1}"})
            with urllib.request.urlopen(req, timeout=25) as r:
                data = r.read()
                total = (r.headers.get("Content-Range") or "").split("/")[-1] or str(len(data))
            resp = app.response_class(data, mimetype="application/octet-stream")
            resp.headers["X-Total"] = total
            resp.headers["Access-Control-Expose-Headers"] = "X-Total"
            resp.headers["Cache-Control"] = "no-store"
            return resp
        except Exception as ex:
            err = str(ex)
    return jsonify({"error": err}), 502


@app.route("/api/direct")
def direct():
    """Résout l'URL puis renvoie une redirection 302. Le navigateur du visiteur suit le redirect
    et télécharge le flux depuis Google avec SON IP résidentielle (que Google accepte), au lieu
    de celle de l'hébergeur. Utilisé via <a download> ou window.open, pas via fetch (CORS)."""
    vid, itag = request.args.get("id", ""), request.args.get("itag", type=int)
    try:
        res = resolve(vid)
        f = res["formats"].get(itag)
        if not f:
            return jsonify({"error": "format introuvable"}), 404
    except Exception as ex:
        return jsonify({"error": str(ex)}), 502
    resp = app.response_class("", status=302)
    resp.headers["Location"] = f["url"]
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------------------------------------------------------------- mode local : téléchargement
if HAS_YTDLP:
    import shutil
    import threading
    import uuid

    from flask import send_file

    DL_DIR = os.path.join(BASE, "downloads")
    TMP_DIR = os.path.join(BASE, ".tmp")
    BIN_DIR = os.path.join(BASE, ".bin")
    for d in (DL_DIR, TMP_DIR, BIN_DIR):
        os.makedirs(d, exist_ok=True)
    _ff = os.path.join(BIN_DIR, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if not os.path.exists(_ff):
        shutil.copy(imageio_ffmpeg.get_ffmpeg_exe(), _ff)
        os.chmod(_ff, 0o755)
    BASE_OPTS = {"quiet": True, "no_warnings": True, "noplaylist": True, "ffmpeg_location": BIN_DIR}
    jobs = {}

    @app.route("/api/stream")
    def stream():
        opts = {**BASE_OPTS, "format": "best[ext=mp4][acodec!=none][vcodec!=none]/best[acodec!=none][vcodec!=none]/best"}
        with yt_dlp.YoutubeDL(opts) as ydl:
            i = ydl.extract_info(request.args.get("url", ""), download=False)
        return redirect(i["url"])

    def run_job(jid, url, kind, quality):
        job = jobs[jid]
        tmp = os.path.join(TMP_DIR, jid)
        os.makedirs(tmp, exist_ok=True)

        def hook(d):
            if d["status"] == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                if total:
                    job["progress"] = round(d["downloaded_bytes"] / total * 100, 1)
                job["speed"] = re.sub(r"\x1b\[[0-9;]*m", "", d.get("_speed_str", "")).strip()
                job["eta"] = re.sub(r"\x1b\[[0-9;]*m", "", d.get("_eta_str", "")).strip()
                job["status"] = "downloading"
            elif d["status"] == "finished":
                job["progress"] = 100
                job["status"] = "converting"

        opts = {**BASE_OPTS, "outtmpl": os.path.join(tmp, "%(title).150B.%(ext)s"), "progress_hooks": [hook]}
        if kind == "mp3":
            opts["format"] = "bestaudio/best"
            opts["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"},
                                      {"key": "FFmpegMetadata"}]
        else:
            h = "" if quality == "best" else f"[height<={quality}]"
            opts["format"] = f"bv*{h}[ext=mp4]+ba[ext=m4a]/bv*{h}+ba/b{h}/b"
            opts["merge_output_format"] = "mp4"
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
            f = max(os.listdir(tmp), key=lambda x: os.path.getsize(os.path.join(tmp, x)))
            dest = os.path.join(DL_DIR, f)
            if os.path.exists(dest):
                b, e = os.path.splitext(f)
                dest = os.path.join(DL_DIR, f"{b}-{jid[:4]}{e}")
            shutil.move(os.path.join(tmp, f), dest)
            job.update(status="done", progress=100, file=os.path.basename(dest))
        except Exception as ex:
            job.update(status="error", error=re.sub(r"\x1b\[[0-9;]*m", "", str(ex)))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    @app.route("/api/download", methods=["POST"])
    def download():
        b = request.get_json(force=True)
        jid = uuid.uuid4().hex
        jobs[jid] = {"id": jid, "status": "queued", "progress": 0, "title": b.get("title", ""), "kind": b["kind"]}
        threading.Thread(target=run_job, args=(jid, b["url"], b["kind"], str(b.get("quality", "best"))), daemon=True).start()
        return jsonify(jobs[jid])

    @app.route("/api/job/<jid>")
    def job(jid):
        return jsonify(jobs.get(jid, {"status": "error", "error": "introuvable"}))

    @app.route("/api/file/<jid>")
    def file(jid):
        j = jobs.get(jid)
        if not j or j.get("status") != "done":
            return "pas prêt", 404
        return send_file(os.path.join(DL_DIR, j["file"]), as_attachment=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "127.0.0.1")  # HOST=0.0.0.0 : accessible depuis le téléphone sur le même wifi
    print(f"\n  DjessTube ({'local' if HAS_YTDLP else 'cloud'})  ->  http://localhost:{port}\n")
    app.run(host=host, port=port, threaded=True)
