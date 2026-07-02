#!/usr/bin/env python3
"""中华字经 HTTP 服务器 + 有道 TTS 代理（解决 CORS）"""
import http.server, urllib.parse, urllib.request, os

ROOT = os.path.expanduser("~/Desktop/zhonghua-zijing")
PORT = 8080

class TTSHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/tts':
            text = urllib.parse.parse_qs(parsed.query).get('text', [''])[0]
            if not text:
                self.send_error(400, 'Missing text')
                return
            try:
                tts_url = 'https://dict.youdao.com/dictvoice?audio=' + urllib.parse.quote(text) + '&le=zh'
                req = urllib.request.Request(tts_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    mp3 = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'audio/mpeg')
                self.send_header('Content-Length', str(len(mp3)))
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(mp3)
            except Exception as e:
                self.send_error(500, str(e))
            return
        super().do_GET()

    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), TTSHandler)
    print(f'Server on :{PORT}')
    server.serve_forever()
