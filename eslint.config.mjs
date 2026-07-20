import nextConfig from "eslint-config-next";

export default [
  { ignores: ["dist/**", ".next/**", "node_modules/**"] },
  ...nextConfig,
];
