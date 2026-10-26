/**
 * RoofFlow AI — embeddable website chat widget.
 * ---------------------------------------------------------------------------
 * Zero dependencies, no secrets, no third-party scripts. The contractor pastes:
 *
 *   <script src="https://<our-site>/widget.js" data-color="#f59e0b" async></script>
 *
 * It injects a floating bubble (bottom-right) that opens widget.html in an
 * iframe (same origin as this script, so it is style-isolated from the host
 * page). Open/close/height are coordinated with postMessage.
 *
 * Visitor details are typed into the iframe and POSTed by the iframe to
 * /api/leads on OUR origin. This script never reads or sends page content.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) {
    var all = document.getElementsByTagName("script");
    script = all[all.length - 1];
  }
  if (!script || script.dataset.rfLoaded === "1") return;
  script.dataset.rfLoaded = "1";

  // Derive our origin from the script URL so the same file works from any host.
  var base;
  try {
    base = new URL(script.src).origin;
  } catch (e) {
    base = window.location.origin;
  }
  var color = script.getAttribute("data-color") || "#f59e0b";
  var label = script.getAttribute("data-label") || "Chat with us";

  var OPEN_W = 380;
  var OPEN_H = 560;

  var root = document.createElement("div");
  root.setAttribute("data-roofflow-widget", "");
  // All styles inline + namespaced: the host page's CSS cannot leak in.
  root.style.cssText =
    "position:fixed;z-index:2147483000;right:20px;bottom:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

  var frame = document.createElement("iframe");
  frame.title = "Roof inspection chat";
  frame.src = base + "/widget.html?color=" + encodeURIComponent(color) + "&embed=1";
  frame.style.cssText =
    "display:none;border:0;width:" +
    OPEN_W +
    "px;height:" +
    OPEN_H +
    "px;max-width:calc(100vw - 32px);max-height:calc(100vh - 120px);" +
    "border-radius:16px;box-shadow:0 18px 50px rgba(2,6,23,.45);background:#0f172a;color-scheme:normal;";
  frame.setAttribute("allow", "clipboard-write");

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "display:flex;align-items:center;gap:9px;margin:12px 0 0 auto;border:0;cursor:pointer;" +
    "padding:14px 18px;border-radius:999px;background:" +
    color +
    ";color:#0b1220;font-weight:800;font-size:14px;line-height:1;" +
    "box-shadow:0 10px 26px rgba(2,6,23,.4);font-family:inherit;";
  button.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
    "</svg><span>" +
    label +
    "</span>";

  var open = false;
  function setOpen(next) {
    open = next;
    frame.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      try {
        frame.contentWindow.postMessage({ type: "roofflow:open" }, base);
      } catch (e) {
        /* frame not ready yet — the iframe asks for state on load instead */
      }
    }
  }

  button.addEventListener("click", function () {
    setOpen(!open);
  });

  // The iframe tells us its content height and when the visitor closes it.
  window.addEventListener("message", function (event) {
    if (event.origin !== base) return;
    var data = event.data || {};
    if (data.type === "roofflow:close") setOpen(false);
    if (data.type === "roofflow:height" && typeof data.height === "number") {
      var h = Math.max(320, Math.min(Math.round(data.height), window.innerHeight - 140));
      frame.style.height = h + "px";
    }
    if (data.type === "roofflow:ready" && open) {
      try {
        frame.contentWindow.postMessage({ type: "roofflow:open" }, base);
      } catch (e) {
        /* ignore */
      }
    }
  });

  root.appendChild(frame);
  root.appendChild(button);

  function mount() {
    if (!document.body) return;
    document.body.appendChild(root);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
