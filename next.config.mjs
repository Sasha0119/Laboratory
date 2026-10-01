/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Supabase settings use lowercase variable names. Next.js only exposes
  // `NEXT_PUBLIC_*` names to the browser on its own, so these two are passed
  // through here and inlined into the bundle at build time.
  env: {
    supabase_url: process.env.supabase_url ?? '',
    supabase_anon_key: process.env.supabase_anon_key ?? '',
  },
};

export default nextConfig;
