import * as forge from "node-forge";
import { restRequest } from "./github";

function base64url(bytes: string): string {
  return forge.util
    .encode64(bytes)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function appJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  );
  const digest = forge.md.sha256.create();
  digest.update(`${header}.${payload}`, "utf8");
  // Aha!'s server runtime has no Node crypto or RSA Web Crypto API.
  const key = forge.pki.privateKeyFromPem(privateKey);
  return `${header}.${payload}.${base64url(key.sign(digest))}`;
}

export async function getInstallationToken(options: {
  appId: string;
  privateKey: string;
  owner: string;
  repo: string;
}): Promise<string> {
  const { appId, privateKey, owner, repo } = options;
  if (!appId || !privateKey) {
    throw new Error(
      "Configure the GitHub App ID and private key in the account extension settings.",
    );
  }
  let jwt: string;
  try {
    jwt = appJwt(appId, privateKey);
  } catch {
    // PEM parsing errors can include input; keep the secret out of logs/results.
    throw new Error(
      "The GitHub App private key must be a valid RSA PEM private key.",
    );
  }
  const installation = await restRequest<{ id: number }>(
    jwt,
    "GET",
    `/repos/${owner}/${repo}/installation`,
  );
  const credentials = await restRequest<{ token: string }>(
    jwt,
    "POST",
    `/app/installations/${installation.id}/access_tokens`,
    {
      repositories: [repo],
      permissions: {
        contents: "write",
        pull_requests: "read",
        actions: "write",
      },
    },
  );
  return credentials.token;
}
