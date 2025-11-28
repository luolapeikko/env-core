# env-core

EnvKit utility to get env variables for multiple sources.
This is a rewrite for older [@avanio/variable-util](https://github.com/mharj/variable-util) packages.

## Packages

- **[@luolapeikko/core-env](packages/core-env/README.md)** - EnvKit core package
- **[@luolapeikko/core-env-azurekv](packages/core-env-azurekv/README.md)** - Azure Key Vault loader
- **[@luolapeikko/core-env-dotenv](packages/core-env-dotenv/README.md)** - .env loader
- **[@luolapeikko/core-env-nodejs](packages/core-env-nodejs/README.md)** - NodeJS loader
- **[@luolapeikko/core-env-vite](packages/core-env-vite/README.md)** - Vite loader
- **[@luolapeikko/core-env-tachyon](packages/core-env-tachyon/README.md)** - Tachyon loader
- **[@luolapeikko/core-env-fetch](packages/core-env-fetch/README.md)** - Fetch loader

## Example for backend application

- .env (only development) as first loader (i.e. manually set values for development)
- settings.dev.json (only development) as second loader (i.e. if need more easy way to setup programatically dev values, like cli pulling from KeyVaults)
- process.env as third loader (first prod loader) (i.e. get prod values container envs or web service envs)
- settings.json as fourth loader (second prod loader) (i.e. setup some prod values like from pipelines/actions)

```typescript
import { EnvKit, KeyParser, ProcessEnvLoader } from "@luolapeikko/core-env";
import { DotEnvLoader } from "@luolapeikko/core-env-dotenv";
import { FileConfigLoader } from "@luolapeikko/core-env-nodejs";

// loaders, setup can be on dedicated file if have multiple EnvKit sets.
export function isDevelopment(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
  );
}
const env = new ProcessEnvLoader();
const dotEnv = new DotEnvLoader({
  disabled: !isDevelopment(),
  watch: isDevelopment(),
});
const devFileEnv = new FileConfigLoader({
  disabled: !isDevelopment(),
  fileName: "./settings.dev.json",
  fileType: "json",
  watch: isDevelopment(),
});
const fileEnv = new FileConfigLoader({
  fileName: "./settings.json",
  fileType: "json",
  watch: isDevelopment(),
});
const loaders = [dotEnv, devFileEnv, env, fileEnv];

// type and EnvKit setup
type EnvVariables = {
  PORT: string;
  SQLITE_PATH: string;
  JWT_SECRET: string;
  DEBUG?: boolean;
};
export const envConfig: EnvKit<EnvVariables> = new EnvKit<EnvVariables>(
  {
    DEBUG: { parser: KeyParser.Boolean() },
    JWT_SECRET: {
      logFormat: "partial",
      notFoundError: true,
      parser: KeyParser.String(),
    },
    PORT: { defaultValue: "4637", parser: KeyParser.String() },
    SQLITE_PATH: {
      defaultValue: "./database.sqlite",
      parser: KeyParser.String(),
    },
  },
  loaders // or function to provide array of loaders
  {logger: console} // use namespace: "value" as optional namespace for logging if having multiple EnvKit sets
);

// usage
const port: number = (await envConfig.get("PORT")).unwrap(); // produce Result<T, Error>, more base usage just use .unwrap() to get value or throw error
const debug: boolean | undefined = (await envConfig.get("DEBUG")).unwrap();
```
