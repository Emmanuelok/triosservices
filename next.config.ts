import type { NextConfig } from 'next';
const nextConfig:NextConfig={
 poweredByHeader:false,
 async headers(){return [
  {source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'X-Frame-Options',value:'SAMEORIGIN'}]},
  ...['operations','crew','portal','staff','sign-in','sign-out','auth','api'].map(route=>({source:'/'+route+'/:path*',headers:[{key:'Cache-Control',value:'private, no-store, max-age=0'},{key:'Pragma',value:'no-cache'}]}))
 ]}
};
export default nextConfig;
