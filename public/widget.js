/**
 * RoofFlow AI — embeddable website chat widget.
 * ---------------------------------------------------------------------------
 * Zero dependencies, no secrets, no third-party scripts. The contractor pastes:
 *
 *   <script src="https://<our-site>/widget.js" data-key="wk_…" data-color="#f59e0b" data-ts="TURNSTILE_SITE_KEY (optional)" async></script>
 *
 * data-key is the contractor's PUBLIC widget key (shown in their CRM). It tells
 * the server which company a lead belongs to. It is an identifier, not a
 * secret: it can only add leads to that company, never read anything.
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
  var key = script.getAttribute("data-key") || "";
  var color = script.getAttribute("data-color") || "#f59e0b";
  var label = script.getAttribute("data-label") || "Chat with us";
  // Optional Cloudflare Turnstile SITE key (public). Needed when the server has TURNSTILE_SECRET_KEY set.
  var ts = script.getAttribute("data-ts") || "";

  var OPEN_W = 380;
  var OPEN_H = 560;
  // Phones (narrow screens, or landscape phones) get a full-screen sheet instead of a
  // floating card, so the on-screen keyboard never hides the form.
  var mq = window.matchMedia ? window.matchMedia("(max-width: 480px), (max-height: 480px)") : null;
  function isSheet() {
    return !!(mq && mq.matches);
  }

  var FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
  // All styles inline + namespaced: the host page's CSS cannot leak in.
  var ROOT_BASE = "position:fixed;z-index:2147483000;" + FONT;
  var ROOT_CORNER =
    "right:20px;bottom:20px;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));";
  var ROOT_SHEET = "left:0;top:0;right:0;bottom:0;width:100%;height:100%;";

  var root = document.createElement("div");
  root.setAttribute("data-roofflow-widget", "");

  var frame = document.createElement("iframe");
  frame.title = "Roof inspection chat";
  frame.src =
    base + "/widget.html?color=" + encodeURIComponent(color) + "&key=" + encodeURIComponent(key) + (ts ? "&ts=" + encodeURIComponent(ts) : "") + "&embed=1";
  frame.setAttribute("allow", "clipboard-write");

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "display:flex;align-items:center;gap:9px;margin:12px 0 0 auto;border:0;cursor:pointer;" +
    "max-width:calc(100vw - 32px);min-height:46px;" +
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
  var cardHeight = OPEN_H;
  var savedOverflow = null;

  function lockScroll(on) {
    var el = document.documentElement;
    if (on && savedOverflow === null) {
      savedOverflow = el.style.overflow;
      el.style.overflow = "hidden";
    } else if (!on && savedOverflow !== null) {
      el.style.overflow = savedOverflow;
      savedOverflow = null;
    }
  }

  // With the keyboard open the visible area is smaller than the screen: follow it.
  function fitKeyboard() {
    var vv = window.visualViewport;
    if (!(open && isSheet() && vv)) return;
    root.style.top = Math.round(vv.offsetTop) + "px";
    root.style.bottom = "auto";
    root.style.height = Math.round(vv.height) + "px";
  }

  function layout() {
    var sheet = open && isSheet();
    root.style.cssText = ROOT_BASE + (sheet ? ROOT_SHEET : ROOT_CORNER);
    frame.style.cssText =
      "border:0;background:#0f172a;color-scheme:normal;display:" +
      (open ? "block" : "none") +
      ";" +
      (sheet
        ? "width:100%;height:100%;max-width:none;max-height:none;border-radius:0;box-shadow:none;"
        : "width:" +
          OPEN_W +
          "px;height:" +
          cardHeight +
          "px;max-width:calc(100vw - 32px);max-height:calc(100vh - 120px);max-height:calc(100dvh - 120px);" +
          "border-radius:16px;box-shadow:0 18px 50px rgba(2,6,23,.45);");
    button.style.display = sheet ? "none" : "flex";
    lockScroll(sheet);
    fitKeyboard();
  }

  function setOpen(next) {
    var wasOpen = open;
    open = next;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    layout();
    if (open) {
      try {
        frame.contentWindow.postMessage({ type: "roofflow:open" }, base);
      } catch (e) {
        /* frame not ready yet — the iframe asks for state on load instead */
      }
    } else if (wasOpen) {
      try {
        button.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }

  button.addEventListener("click", function () {
    setOpen(!open);
  });

  document.addEventListener("keydown", function (event) {
    if (open && event.key === "Escape") setOpen(false);
  });
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitKeyboard);
    window.visualViewport.addEventListener("scroll", fitKeyboard);
  }
  if (mq) {
    if (mq.addEventListener) mq.addEventListener("change", layout);
    else if (mq.addListener) mq.addListener(layout);
  }

  // The iframe tells us its content height and when the visitor closes it.
  window.addEventListener("message", function (event) {
    if (event.origin !== base) return;
    var data = event.data || {};
    if (data.type === "roofflow:close") setOpen(false);
    if (data.type === "roofflow:height" && typeof data.height === "number" && !(open && isSheet())) {
      cardHeight = Math.max(320, Math.min(Math.round(data.height), window.innerHeight - 140));
      layout();
    }
    if (data.type === "roofflow:ready" && open) {
      try {
        frame.contentWindow.postMessage({ type: "roofflow:open" }, base);
      } catch (e) {
        /* ignore */
      }
    }
  });

  layout();
  root.appendChild(frame);
  root.appendChild(button);

  function mount() {
    if (!document.body) return;
    document.body.appendChild(root);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
