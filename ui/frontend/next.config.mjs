/** @type {import('next').NextConfig} */
const nextConfig = {
    // Ensure Next.js uses SSG instead of SSR
    // https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
    output: 'export',
    reactStrictMode: false,
    images: {
        // Static export builds do not allow image optimization
        unoptimized: true
    }
};

export default nextConfig;

