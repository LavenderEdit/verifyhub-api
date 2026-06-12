import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsUrl,
  IsBoolean,
  validateSync,
  IsOptional,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  RUN_MODE?: string = 'api';

  @IsUrl({ require_tld: false })
  APP_URL: string = 'http://localhost:3000';

  @IsUrl({ require_tld: false })
  DASHBOARD_URL: string = 'http://localhost:4000';

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  COOKIE_DOMAIN: string = 'localhost';

  @IsBoolean()
  COOKIE_SECURE: boolean = false;

  @IsString()
  COOKIE_SAME_SITE: string = 'strict';

  @IsString()
  ENCRYPTION_MASTER_KEY!: string;

  @IsString()
  API_KEY_PEPPER!: string;

  @IsString()
  WEBHOOK_SIGNING_SECRET!: string;

  @IsString()
  WWEBJS_SESSION_PATH: string = './wwebjs_sessions';

  @IsString()
  @IsOptional()
  WWEBJS_CHROMIUM_EXECUTABLE_PATH?: string;

  @IsNumber()
  RATE_LIMIT_DEFAULT_TTL: number = 60;

  @IsNumber()
  RATE_LIMIT_DEFAULT_LIMIT: number = 100;

  @IsNumber()
  OTP_DEFAULT_EXPIRATION_MINUTES: number = 5;

  @IsNumber()
  OTP_DEFAULT_LENGTH: number = 6;
}

export function validate(config: Record<string, any>) {
  // Convert numerical string properties to numbers and boolean string properties to booleans
  const convertedConfig = { ...config };

  if (convertedConfig.PORT) {
    convertedConfig.PORT = Number(convertedConfig.PORT);
  }
  if (convertedConfig.COOKIE_SECURE) {
    convertedConfig.COOKIE_SECURE =
      convertedConfig.COOKIE_SECURE === 'true' ||
      convertedConfig.COOKIE_SECURE === true;
  } else {
    convertedConfig.COOKIE_SECURE = false;
  }
  if (convertedConfig.RATE_LIMIT_DEFAULT_TTL) {
    convertedConfig.RATE_LIMIT_DEFAULT_TTL = Number(
      convertedConfig.RATE_LIMIT_DEFAULT_TTL,
    );
  }
  if (convertedConfig.RATE_LIMIT_DEFAULT_LIMIT) {
    convertedConfig.RATE_LIMIT_DEFAULT_LIMIT = Number(
      convertedConfig.RATE_LIMIT_DEFAULT_LIMIT,
    );
  }
  if (convertedConfig.OTP_DEFAULT_EXPIRATION_MINUTES) {
    convertedConfig.OTP_DEFAULT_EXPIRATION_MINUTES = Number(
      convertedConfig.OTP_DEFAULT_EXPIRATION_MINUTES,
    );
  }
  if (convertedConfig.OTP_DEFAULT_LENGTH) {
    convertedConfig.OTP_DEFAULT_LENGTH = Number(
      convertedConfig.OTP_DEFAULT_LENGTH,
    );
  }

  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    convertedConfig,
    {
      enableImplicitConversion: true,
    },
  );

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }
  return validatedConfig;
}
