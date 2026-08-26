const AIRTABLE_API_BASE = "https://api.airtable.com/v0";

const WEBSITE_CATALOGUE_FIELDS = [
  "Release ID",
  "Live Listing",
  "Title (Display)",
  "Website Artist",
  "Website Date",
  "Website Formats",
  "Website Link",
] as const;

type AirtableReleaseFields = Record<string, unknown>;

type AirtableReleaseRecord = {
  id: string;
  fields: AirtableReleaseFields;
};

type AirtableReleaseListResponse = {
  records: AirtableReleaseRecord[];
  offset?: string;
};

export type WebsiteCatalogueRelease = {
  releaseId: string;
  title: string;
  artist: string;
  year: string;
  formats: string;
  link: string;
};

export type WebsiteCatalogueResponse = {
  releases: WebsiteCatalogueRelease[];
  count: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function asRequiredDisplayString(
  value: unknown,
  fieldName: string,
  airtableRecordId: string,
): string {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  throw new Error(
    `Published website catalogue record ${airtableRecordId} is missing "${fieldName}"`,
  );
}

function isAirtableReleaseRecord(
  value: unknown,
): value is AirtableReleaseRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.fields === "object" &&
    candidate.fields !== null &&
    !Array.isArray(candidate.fields)
  );
}

function parseAirtableResponse(
  value: unknown,
): AirtableReleaseListResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Airtable website catalogue returned an invalid response",
    );
  }

  const candidate = value as Record<string, unknown>;

  if (
    !Array.isArray(candidate.records) ||
    !candidate.records.every(isAirtableReleaseRecord)
  ) {
    throw new Error(
      "Airtable website catalogue returned invalid records",
    );
  }

  if (
    candidate.offset !== undefined &&
    typeof candidate.offset !== "string"
  ) {
    throw new Error(
      "Airtable website catalogue returned an invalid offset",
    );
  }

  return {
    records: candidate.records,
    ...(typeof candidate.offset === "string"
      ? { offset: candidate.offset }
      : {}),
  };
}

function mapPublishedRelease(
  record: AirtableReleaseRecord,
): WebsiteCatalogueRelease {
  const { fields } = record;

  if (fields["Live Listing"] !== true) {
    throw new Error(
      `Non-live Airtable record ${record.id} reached the website catalogue mapper`,
    );
  }

  return {
    releaseId: asRequiredDisplayString(
      fields["Release ID"],
      "Release ID",
      record.id,
    ),
    title: asRequiredDisplayString(
      fields["Title (Display)"],
      "Title (Display)",
      record.id,
    ),
    artist: asRequiredDisplayString(
      fields["Website Artist"],
      "Website Artist",
      record.id,
    ),
    year: asRequiredDisplayString(
      fields["Website Date"],
      "Website Date",
      record.id,
    ),
    formats: asRequiredDisplayString(
      fields["Website Formats"],
      "Website Formats",
      record.id,
    ),
    link: asRequiredDisplayString(
      fields["Website Link"],
      "Website Link",
      record.id,
    ),
  };
}

async function fetchWebsiteCataloguePage(
  offset?: string,
): Promise<AirtableReleaseListResponse> {
  const token = requiredEnv("AIRTABLE_TOKEN");
  const baseId = requiredEnv("AIRTABLE_CATALOGUE_ID");
  const tableId = requiredEnv("AIRTABLE_RELEASES_TABLE");
  const viewId = requiredEnv("AIRTABLE_WEBSITE_CATALOGUE_VIEW");

  const url = new URL(
    `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableId)}`,
  );

  url.searchParams.set("view", viewId);
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("filterByFormula", "{Live Listing}=1");

  for (const field of WEBSITE_CATALOGUE_FIELDS) {
    url.searchParams.append("fields[]", field);
  }

  if (offset) {
    url.searchParams.set("offset", offset);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Airtable website catalogue request failed (${response.status})`,
    );
  }

  const payload: unknown = await response.json();
  return parseAirtableResponse(payload);
}

export async function listWebsiteCatalogueReleases(): Promise<
  WebsiteCatalogueRelease[]
> {
  const releases: WebsiteCatalogueRelease[] = [];
  let offset: string | undefined;

  do {
    const page = await fetchWebsiteCataloguePage(offset);

    for (const record of page.records) {
      releases.push(mapPublishedRelease(record));
    }

    offset = page.offset;
  } while (offset);

  return releases;
}
