/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_LEMON_CHECKOUT_STARTER?: string;
  readonly VITE_LEMON_CHECKOUT_PRO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
