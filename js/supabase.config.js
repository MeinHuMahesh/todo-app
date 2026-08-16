// Supabase configuration — replace the placeholders below with your project's values.
//
// 1. Go to https://supabase.com and create a free project.
// 2. Open Project Settings > API and copy:
//    - Project URL -> SUPABASE_CONFIG.url
//    - Publishable key -> SUPABASE_CONFIG.publishableKey
//      (this is the new name for the "anon / public" key — same value)
// 3. Run the SQL from supabase-setup.sql in the SQL Editor (once).
//
// Until you fill these in, the app runs in local-only mode (no backend).
//
// Deployment: the app checks for per-site overrides first (loaded from
// js/supabase.env.js before this file, e.g. generated from Netlify/Vercel
// env vars by the hosting build), falling back to the values below.
// Example generated file:
//   window.SUPABASE_URL = 'https://xxx.supabase.co';
//   window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xxx';

const SUPABASE_CONFIG = {
    url: window.SUPABASE_URL || 'https://pbniojevqjhuyuqohglq.supabase.co',
    publishableKey: window.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_JBak-Cksoc_DZscvP5_t9w_QU0AfLGa'
};

function supabaseConfigured() {
    return SUPABASE_CONFIG.url.startsWith('https://') &&
        !SUPABASE_CONFIG.url.includes('YOUR-PROJECT') &&
        !SUPABASE_CONFIG.publishableKey.includes('YOUR-PUBLISHABLE-KEY');
}