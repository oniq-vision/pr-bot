import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

let cachedPem: string | undefined;

async function getAppPrivateKey(): Promise<string> {
  if (cachedPem) return cachedPem;

  if (process.env.GH_APP_PRIVATE_KEY_PEM) {
    cachedPem = process.env.GH_APP_PRIVATE_KEY_PEM.replace(/\\n/g, '\n');
    return cachedPem;
  }
  const vaultUrl = process.env.KEYVAULT_URL;
  const secretName = process.env.GH_APP_PRIVATE_KEY_SECRET || 'github-app-private-key';
  if (!vaultUrl) throw new Error('KEYVAULT_URL not set and GH_APP_PRIVATE_KEY_PEM not provided');
  const client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  const { value } = await client.getSecret(secretName);
  if (!value) throw new Error('GitHub App private key missing in Key Vault');
  cachedPem = value;
  return value;
}

export async function getOctokitForInstallation(installationId?: number | string): Promise<Octokit> {
  const appId = process.env.GH_APP_ID;
  if (!appId) throw new Error('GH_APP_ID missing');
  const privateKey = await getAppPrivateKey();
  const instId = installationId || process.env.GH_INSTALLATION_ID;
  if (!instId) throw new Error('GH_INSTALLATION_ID missing and no installationId provided');

  return new Octokit({
    authStrategy: createAppAuth as any,
    auth: { appId, privateKey, installationId: instId as any }
  });
}
