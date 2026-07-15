import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 배포용 최소 런타임 출력
  output: "standalone",
};

export default nextConfig;
