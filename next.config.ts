import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // TypeScript 7 is checked through its CLI; Next's compiler-API worker does not yet support it.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
