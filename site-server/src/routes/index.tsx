import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

// The RoofFlow AI app (built SPA) lives at /app/index.html as a static asset.
// This route exists only to send visitors there: React 19 hoists the
// <meta http-equiv="refresh"> into <head>, so the redirect fires immediately
// (server-rendered too — no waiting for hydration). The useEffect and the
// visible link are belt-and-suspenders for environments that ignore meta refresh.
export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  useEffect(() => {
    window.location.replace("/app/index.html");
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
      <meta httpEquiv="refresh" content="0; url=/app/index.html" />
      <p className="text-sm font-medium text-slate-200">
        Opening RoofFlow AI…
      </p>
      <a
        href="/app/index.html"
        className="text-sm font-semibold text-amber-400 underline hover:text-amber-300"
      >
        Click here if you are not redirected
      </a>
    </main>
  );
}
