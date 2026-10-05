// ponytail: адрес бэкенда фиксируется на этапе сборки; в docker-compose это http://backend:8008
const backend = process.env.BACKEND_URL || "http://localhost:8008";

export default {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/static/:path*", destination: `${backend}/static/:path*` },
    ];
  },
};
