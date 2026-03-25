const AIRTABLE_API_BASE = "https://api.airtable.com/v0";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getAirtableConfig(): {
  token: string;
  baseId: string;
  recordingsTableId: string;
  recordingsViewId: string;
} {
  return {
    token: getRequiredEnv("AIRTABLE_TOKEN"),
    baseId: getRequiredEnv("AIRTABLE_CATALOGUE_ID"),
    recordingsTableId: getRequiredEnv("AIRTABLE_RECORDINGS_TABLE"),
    recordingsViewId: getRequiredEnv("AIRTABLE_RECORDINGS_VIEW"),
  };
}

export async function airtableGet<TResponse>(params: {
  path: string;
  searchParams?: Record<string, string>;
}): Promise<TResponse> {
  const { token } = getAirtableConfig();

  const url = new URL(`${AIRTABLE_API_BASE}/${params.path}`);

  Object.entries(params.searchParams ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as TResponse;
}