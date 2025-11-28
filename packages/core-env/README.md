# @luolapeikko/core-env

Core package for EnvKit to manage environment variable loading and parsing.

## Features

- Core Loaders
- Parsers
- Type definitions
- EnvKit as configuration schema setup.

## Example

```typescript
import { EnvKit, ProcessEnvLoader, KeyParser } from "@luolapeikko/core-env";

type EnvMap = {
  DB_PASSWORD: string;
  PORT?: number;
};

const envLoader = new ProcessEnvLoader<EnvMap>(); // get env from process.env[KEY]

const baseEnv = new EnvKit<EnvMap>(
  {
    DB_PASSWORD: {
      notFoundError: true,
      parser: KeyParser.String(),
      logFormat: "partial",
    },
    PORT: { parser: KeyParser.Integer() },
  },
  [envLoader]
);

const dbPassword: string = (await baseEnv.get("DB_PASSWORD")).unwrap();
const port: number | undefined = (await baseEnv.get("PORT")).unwrap();
```
