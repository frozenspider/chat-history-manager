import CopyWebpackPlugin from "copy-webpack-plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Ensure Next.js uses SSG instead of SSR
    // https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
    output: 'export',
    reactStrictMode: false,
    images: {
        // Static export builds do not allow image optimization
        unoptimized: true
    },
    webpack: (config) => {
        // Copy ogv.js files to be served as static assets
        config.plugins.push(
            new CopyWebpackPlugin({
                patterns: [
                    {from: "node_modules/ogv/dist", to: "../public/js/ogv"},
                ]
            }),
        );
        return config;
    }
};

export default nextConfig;

