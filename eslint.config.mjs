import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", ".open-next/**", "dist/**", "node_modules/**", "*.tar", "*.tar.gz"] },
  ...nextVitals,
];

export default config;
