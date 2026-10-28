import { generateKeyPairSync, verify } from "crypto";
import { appJwt, getInstallationToken } from "./githubApp";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = String(
  keys.privateKey.export({ type: "pkcs1", format: "pem" }),
);

afterEach(() => jest.restoreAllMocks());

it("signs an RS256 JWT using the App ID and GitHub's time limits", () => {
  jest.spyOn(Date, "now").mockReturnValue(1000000);
  const jwt = appJwt("123456", privateKey);
  const [header, payload, signature] = jwt.split(".");
  expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
    alg: "RS256",
    typ: "JWT",
  });
  expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
    iss: "123456",
    iat: 940,
    exp: 1540,
  });
  expect(
    verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      keys.publicKey,
      Buffer.from(signature, "base64url"),
    ),
  ).toBe(true);
});

it("discovers the installation and restricts its token to the selected repository", async () => {
  const fetchMock = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      ok: true,
      text: async () => '{"id":123}',
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      text: async () => '{"token":"installation-token"}',
    } as Response);
  await expect(
    getInstallationToken({
      appId: "123456",
      privateKey,
      owner: "acme",
      repo: "app",
    }),
  ).resolves.toBe("installation-token");
  expect(fetchMock.mock.calls[0][0]).toBe(
    "https://api.github.com/repos/acme/app/installation",
  );
  expect(fetchMock.mock.calls[1][0]).toBe(
    "https://api.github.com/app/installations/123/access_tokens",
  );
  expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
    repositories: ["app"],
    permissions: { contents: "write", pull_requests: "read", actions: "write" },
  });
});

it("reports an invalid key without returning its contents", async () => {
  await expect(
    getInstallationToken({
      appId: "123456",
      privateKey: "sensitive-invalid-key",
      owner: "acme",
      repo: "app",
    }),
  ).rejects.toThrow(
    "The GitHub App private key must be a valid RSA PEM private key.",
  );
});

it("reports an incomplete App configuration instead of falling back to OAuth", async () => {
  const fetchMock = jest.spyOn(globalThis, "fetch");
  await expect(
    getInstallationToken({
      appId: "123456",
      privateKey: "",
      owner: "acme",
      repo: "app",
    }),
  ).rejects.toThrow("Configure the GitHub App ID and private key");
  await expect(
    getInstallationToken({ appId: "", privateKey, owner: "acme", repo: "app" }),
  ).rejects.toThrow("Configure the GitHub App ID and private key");
  expect(fetchMock).not.toHaveBeenCalled();
});
