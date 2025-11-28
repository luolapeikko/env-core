import {ExpireCache} from '@avanio/expire-cache';
import type {ILoggerLike} from '@avanio/logger-like';
import type {TokenCredential} from '@azure/identity';
import {SecretClient} from '@azure/keyvault-secrets';
import {AbstractBaseLoader, type IAbstractBaseLoaderProps, type LoaderValueResult} from '@luolapeikko/core-env';
import {ErrorCast} from '@luolapeikko/core-ts-error';
import type {Loadable} from '@luolapeikko/core-ts-type';
import {Err, type IResult, Ok, Result} from '@luolapeikko/result-option';

/**
 * Azure Key Vault secrets loader options
 * @since v0.0.1
 */
export interface AzureSecretsConfigLoaderOptions extends IAbstractBaseLoaderProps {
	credentials: TokenCredential;
	/** Azure Key Vault URL, example `https://myvault.vault.azure.net` */
	url: string;
	logger?: ILoggerLike;
	/** optional ExpireCache logger */
	cacheLogger?: ILoggerLike;
	/** value expire time in ms to force read again from Azure Key Vault, default is never = undefined */
	expireMs?: number;
	/** if secrets lookup have error, how long to cache the error Promise, default is 60sec */
	errExpireMs?: number;
}

/**
 * Map of EnvMap keys to Azure Key Vault secret names
 * @since v0.0.1
 */
export type KeySecretMap<T extends Record<string, unknown>> = {[K in keyof T]?: string};

/**
 * Load environment variables from Azure Key Vault secrets, uses ExpireCache to cache values (expireMs option to set cache expire time)
 * @since v0.0.1
 * @example
 * type EnvMap = {
 *   API_SERVER: URL;
 *   PORT?: number; // not in KV
 * };
 * const kvLoader = new AzureSecretsConfigLoader<EnvMap>(
 *   {API_SERVER: 'backend-service-url'},
 *   {credentials: new DefaultAzureCredential(), url: keyVaultUri},
 * );
 */
export class AzureSecretsConfigLoader<EnvMap extends Record<string, unknown>> extends AbstractBaseLoader<AzureSecretsConfigLoaderOptions> {
	public loaderType: Lowercase<string>;
	private readonly valuePromises = new ExpireCache<Promise<IResult<LoaderValueResult, Error>>>();
	#secretClient: SecretClient | undefined;
	#keySecretMap: Map<string, string | undefined>;

	protected defaultOptions: AzureSecretsConfigLoaderOptions = {
		credentials: {
			getToken: () => {
				throw new Error('credentials not set');
			},
		},
		url: 'http://localhost',
	};

	/**
	 * Create AzureSecretsConfigLoader
	 * @param {KeySecretMap<EnvMap>} keySecretMap - map of EnvMap keys to Azure Key Vault secret names
	 * @param {Loadable<AzureSecretsConfigLoaderOptions>} options - loader options
	 * @param {Lowercase<string>} loaderType - optional loader type name (default: 'azure-secrets')
	 */
	public constructor(keySecretMap: KeySecretMap<EnvMap>, options: Loadable<AzureSecretsConfigLoaderOptions>, loaderType: Lowercase<string> = 'azure-secrets') {
		super(options);
		this.#keySecretMap = new Map(Object.entries(keySecretMap));
		this.loaderType = loaderType;
		void this.init();
	}

	/**
	 * Initialize AzureSecretsConfigLoader
	 * - set optional cacheLogger for cache logging
	 * - set optional expireMs for value cache
	 * @returns {Promise<IResult<void, Error>>} Result Promise of init
	 */
	public init(): Promise<IResult<void, Error>> {
		return Result.asyncTupleFlow(this.getOptions(), ({cacheLogger, expireMs}) => {
			// setup expire cache options
			if (cacheLogger) {
				this.valuePromises.logger.setLogger(cacheLogger);
			}
			if (expireMs !== undefined) {
				this.valuePromises.setExpireMs(expireMs);
			}
			return Ok();
		});
	}

	/**
	 * Clear all cached values.
	 */
	public reload(): void {
		this.valuePromises.clear();
	}

	/**
	 * Get raw value from Azure Key Vault secret.
	 * @param {string} lookupKey - key to lookup
	 * @returns {Promise<IResult<LoaderValueResult, Error>>} Result Promise of getRawValue
	 */
	protected getRawValue(lookupKey: string): Promise<IResult<LoaderValueResult, Error>> {
		const key = this.#keySecretMap.get(lookupKey);
		return Result.asyncTupleFlow(this.getOptions(), async (options) => {
			if (!key || options.disabled) {
				return Ok({path: options.url, value: undefined});
			}
			// only read once per key
			let lastValuePromise = this.valuePromises.get(key);
			if (!lastValuePromise) {
				lastValuePromise = this.#handleLoaderPromise(options, key);
				this.valuePromises.set(key, lastValuePromise);
				(await lastValuePromise)
					.inspectOk(() => {
						options.logger?.debug(this.buildLogStr(`loaded secret ${key} from ${options.url}`));
					})
					.inspectErr((err) => {
						options.logger?.error(this.buildLogStr(`error loading secret ${key} from ${options.url}: ${err.message}`));
						// if the promise fails, remove it from cache to allow retry next time
						setTimeout(() => {
							this.valuePromises.delete(key);
						}, options.errExpireMs ?? 60000); // default 60sec
					});
			}
			return lastValuePromise;
		});
	}

	async #handleLoaderPromise(options: AzureSecretsConfigLoaderOptions, lookupKey: string): Promise<IResult<LoaderValueResult, Error>> {
		try {
			this.#secretClient ??= new SecretClient(options.url, options.credentials);
			options.logger?.debug(this.buildLogStr(`getting ${lookupKey} from ${options.url}`));
			const {
				value,
				properties: {vaultUrl},
			} = await this.#secretClient.getSecret(lookupKey);
			return Ok({path: `${vaultUrl}/${lookupKey}`, value});
		} catch (err) {
			return Err(ErrorCast.from(err));
		}
	}
}
