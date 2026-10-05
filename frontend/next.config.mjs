export default {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:8008/api/:path*" },
      { source: "/static/:path*", destination: "http://localhost:8008/static/:path*" },
    ];
  },
};
