/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/kspiel",
  assetPrefix: "/kspiel/",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
