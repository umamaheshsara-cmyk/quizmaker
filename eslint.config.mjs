import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
	{
		ignores: [
			"node_modules/**",
			".next/**",
			".open-next/**",
			".wrangler/**",
			"out/**",
			"build/**",
			"next-env.d.ts",
			"cloudflare-env.d.ts",
		],
	},
	...nextCoreWebVitals,
	...nextTypescript,
];

export default eslintConfig;
