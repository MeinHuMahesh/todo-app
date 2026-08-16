// Per-deployment Supabase overrides (optional).
//
// This file is loaded before supabase.config.js. Ship it empty here and, on
// hosting platforms, generate it at build time from env vars so credentials
// never live in the repo. Example Netlify build command:
//
//   echo "window.SUPABASE_URL = '$SUPABASE_URL';
//         window.SUPABASE_PUBLISHABLE_KEY = '$SUPABASE_PUBLISHABLE_KEY';" \
//     > js/supabase.env.js
//
// When absent (or with no values set), supabase.config.js falls back to the
// committed defaults.