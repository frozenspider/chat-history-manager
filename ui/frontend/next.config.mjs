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
    /**
     * @param {import('webpack').Configuration} webpackConfig
     * @returns {import('webpack').Configuration}
     */
    webpack(webpackConfig) {
        // Copy ogv.js files to be served as static assets
        webpackConfig.plugins.push(
            new CopyWebpackPlugin({
                patterns: [
                    {from: "node_modules/ogv/dist", to: "../public/js/ogv"},
                ]
            }),
        )
        webpackConfig.optimization.minimize = false // Can be disabled for debugging

        // // Unable to compile reworkcss/css without this:
        // webpackConfig.resolve.fallback = {
        //     fs: false
        // }
        return webpackConfig
    },
    compress: false,
};

export default nextConfig;

