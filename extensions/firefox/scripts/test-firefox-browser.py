"""Native Firefox smoke test. Requires marionette_driver (see README). Uses only fake local data."""
import gc
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from marionette_driver.marionette import Marionette
from marionette_driver.addons import Addons

ROOT = Path(__file__).resolve().parent.parent
UUID = "11111111-2222-4333-8444-555555555555"
USER = "11111111-1111-4111-8111-111111111111"
BOOKMARK = "22222222-2222-4222-8222-222222222222"
ORIGIN = f"moz-extension://{UUID}"
writes = []

class FixtureServer(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path.startswith("/v1/"):
            self.respond({"data": {"items": [], "nextCursor": None}})
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"""<!doctype html><title>Firefox smoke test</title><main>Local Firefox fixture</main>
<button id="pair">Pair fixture</button><script>
document.getElementById('pair').onclick = () => {
  const params = new URLSearchParams(location.search);
  const requestId = crypto.randomUUID();
  window.addEventListener('message', event => {
    if (event.data?.type === 'favlock.firefox.pair-response' && event.data.requestId === requestId) {
      document.body.dataset.pairResult = JSON.stringify(event.data);
    }
  });
  window.postMessage({type:'favlock.firefox.pair-request',requestId,extensionId:params.get('extensionId'),pairingAttempt:params.get('attempt'),userId:'11111111-1111-4111-8111-111111111111',rawKey:'A'.repeat(32),sessionTokenHash:'fake-one-time-token'},location.origin);
};
</script>""")

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
        if self.path == "/v1/auth/session/verify":
            assert body == {"tokenHash": "fake-one-time-token"}
            self.respond({"data": {"session": {"accessToken": "fake-access", "refreshToken": "fake-refresh", "expiresAt": int(time.time()) + 3600, "user": {"id": USER, "email": "firefox-test@example.com"}}}})
        else:
            writes.append((self.path, body))
            self.respond({"data": {"bookmarkId": BOOKMARK, "entryId": BOOKMARK}})

    def respond(self, payload):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureServer)
threading.Thread(target=server.serve_forever, daemon=True).start()
local_origin = f"http://127.0.0.1:{server.server_port}"
qa = ROOT / "dist/qa"
qa.mkdir(parents=True, exist_ok=True)

with tempfile.TemporaryDirectory(prefix="favlock-firefox-test-") as temporary:
    package = Path(temporary) / "extension"
    shutil.copytree(ROOT / "dist/development", package)
    config = {"target": "development", "dashboardUrl": local_origin + "/", "apiUrl": local_origin, "extensionId": "firefox@favlock.app"}
    (package / "config.generated.js").write_text("export const GENERATED_FAVLOCK_CONFIG = " + json.dumps(config) + ";\n")
    manifest = json.loads((package / "manifest.json").read_text())
    manifest["host_permissions"] = ["http://127.0.0.1/*"]
    manifest["content_scripts"][0]["matches"] = ["http://127.0.0.1/*"]
    manifest["web_accessible_resources"][0]["matches"] = ["http://127.0.0.1/*"]
    manifest["content_security_policy"]["extension_pages"] = f"script-src 'self'; object-src 'none'; connect-src {local_origin}"
    (package / "manifest.json").write_text(json.dumps(manifest))
    binary = os.environ.get("FIREFOX_BINARY", "/Applications/Firefox.app/Contents/MacOS/firefox")
    browser = Marionette(bin=binary, port=2829, app_args=["-headless", "-remote-allow-system-access"], prefs={"extensions.webextensions.uuids": json.dumps({"firefox@favlock.app": UUID}), "browser.shell.checkDefaultBrowser": False}, gecko_log=str(qa / "firefox.log"))

    def script(source, *args):
        return browser.execute_script(source, script_args=args, sandbox=None)

    def async_script(source, *args):
        result = browser.execute_async_script("const done=arguments[arguments.length-1]; (async()=>{" + source + "})().then(done, e=>done({error:e.message}));", script_args=args, sandbox=None)
        if isinstance(result, dict) and "error" in result:
            raise AssertionError(result["error"])
        return result

    def wait_for(check):
        for _ in range(100):
            if check():
                return
            time.sleep(.1)
        raise AssertionError("Firefox did not reach the expected state")

    try:
        browser.start_session()
        print("Firefox", browser.session_capabilities["browserVersion"], flush=True)
        assert Addons(browser).install(str(package), temp=True) == "firefox@favlock.app"
        browser.navigate(ORIGIN + "/popup.html")
        wait_for(lambda: script('return document.getElementById("connectButton").textContent === "Connect FavLock";'))
        state = async_script('return await browser.runtime.sendMessage({type:"favlock.extension.connection-state"});')
        assert state["ok"] and not state["connected"]
        (qa / "popup.png").write_bytes(browser.screenshot(element=browser.find_element("css selector", ".popup-shell"), format="binary"))
        original = browser.current_window_handle
        async_script('return await browser.runtime.sendMessage({type:"favlock.extension.connect"});')
        wait_for(lambda: len(browser.window_handles) > 1)
        pair_tab = next(handle for handle in browser.window_handles if handle != original)
        browser.switch_to_window(pair_tab)
        wait_for(lambda: "/extension/firefox/pair?" in browser.get_url())
        # Exercise the actual content-script bridge with a fake local one-time token.
        browser.find_element("css selector", "#pair").click()
        wait_for(lambda: pair_tab not in browser.window_handles)
        time.sleep(.4)
        browser.switch_to_window(original)
        browser.navigate(ORIGIN + "/popup.html")
        wait_for(lambda: script('return !document.getElementById("quickAddForm").hidden;'))
        state = async_script('return await browser.runtime.sendMessage({type:"favlock.extension.connection-state"});')
        assert state["connected"] and state["unlocked"]
        (qa / "popup-connected.png").write_bytes(browser.screenshot(element=browser.find_element("css selector", ".popup-shell"), format="binary"))
        result = async_script('''
          const data = await import(browser.runtime.getURL("extension-data.js"));
          return await data.saveCurrentPage({title:"Private Firefox title", url:"https://example.com/private-firefox", selectedTagIds:[], newTagNames:[], selectedListIds:[], folders:[], tags:[]});
        ''')
        assert result["bookmarkId"] == BOOKMARK
        result = async_script('''
          const data = await import(browser.runtime.getURL("extension-data.js"));
          return await data.saveReadspaceArticle({title:"Private Firefox article",sourceUrl:"https://example.com/private-article",html:"<p>Private article text.</p>", capturedAt:new Date().toISOString()});
        ''')
        assert result["entryId"] == BOOKMARK
        assert [path for path, _ in writes] == ["/v1/bookmarks", "/v1/entries"]
        for _, body in writes:
            assert "Private" not in json.dumps(body) and "https://example.com" not in json.dumps(body)
            assert body["encryptedTitle"].startswith("enc:")
        assert writes[0][1]["encryptedUrl"].startswith("enc:")
        assert writes[1][1]["encryptedContent"].startswith("enc:")
        # Test iframe isolation and the permission-denied import response.
        browser.navigate(local_origin + "/settings")
        imported = async_script('''
          return await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(new Error("Import bridge timeout")),10000);
            const frame=document.createElement("iframe");
            const origin=arguments[0]; const requestId=crypto.randomUUID();
            window.addEventListener("message",function receive(event){
              if(event.source!==frame.contentWindow || event.origin!==origin) return;
              if(event.data?.type==="FAVLOCK_FIREFOX_EXTENSION_READY") frame.contentWindow.postMessage({type:"FAVLOCK_FIREFOX_BOOKMARKS_REQUEST",requestId},origin);
              if(event.data?.type==="FAVLOCK_FIREFOX_BOOKMARKS_RESULT" && event.data.requestId===requestId){clearTimeout(timer); window.removeEventListener("message",receive);resolve({result:event.data});}
            });
            frame.src=origin+"/bookmark-import-bridge.html"; document.body.append(frame);
          });
        ''', ORIGIN)
        assert "Allow Firefox bookmark access" in imported["result"]["error"]
        browser.navigate(ORIGIN + "/options.html")
        wait_for(lambda: script('return document.getElementById("accountDescription").textContent.includes("firefox-test@example.com");'))
        (qa / "options.png").write_bytes(browser.screenshot(full=True, format="binary"))
        browser.set_window_rect(width=420, height=900)
        (qa / "options-narrow.png").write_bytes(browser.screenshot(full=True, format="binary"))
        async_script('await browser.storage.sync.set({useFavLockNewTab:true}); return true;')
        tab = async_script('return await browser.tabs.create({});')
        wait_for(lambda: async_script('return (await browser.tabs.get(arguments[0])).url;', tab["id"]) == local_origin + "/")
        async_script('await browser.tabs.remove(arguments[0]); return await browser.runtime.sendMessage({type:"favlock.extension.disconnect"});', tab["id"])
        state = async_script('return await browser.runtime.sendMessage({type:"favlock.extension.connection-state"});')
        assert not state["connected"] and not state["unlocked"]
        print("PASS: native background, popup, pairing bridge, encrypted bookmark/article saves, import permission denial, settings, new-tab preference, disconnect", flush=True)
    finally:
        browser.quit()
        browser.cleanup()
        server.shutdown()

    del browser
    gc.collect()
