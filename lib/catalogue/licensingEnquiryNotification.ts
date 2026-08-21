import crypto from "crypto";
import { Resend } from "resend";
import type { CatalogueLicensingEnquiryRequest } from "@/lib/catalogue/licensingEnquiryTypes";
import type { CatalogueLicensingTrackSnapshot } from "@/lib/catalogue/licensingEnquiries";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";

type SendCatalogueLicensingNotificationInput = {
  enquiryId: string;
  submission: CatalogueLicensingEnquiryRequest;
  tracks: CatalogueLicensingTrackSnapshot[];
  shareLink: CatalogueShareLinkSummary | null;
};

type ResendIdRow = {
  id: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalLine(label: string, value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

function rightsRequestLabel(
  value: CatalogueLicensingEnquiryRequest["rightsRequest"],
): string {
  return value === "master_only"
    ? "Master only"
    : "Full sync + master";
}

function errorText(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    return (value as { message: string }).message;
  }

  return String(value);
}

function firstResendId(dataUnknown: unknown): string | null {
  let rows: unknown[] | null = null;

  if (Array.isArray(dataUnknown)) {
    rows = dataUnknown;
  } else if (
    dataUnknown &&
    typeof dataUnknown === "object" &&
    "data" in dataUnknown
  ) {
    const nested = (dataUnknown as { data?: unknown }).data;

    if (Array.isArray(nested)) {
      rows = nested;
    }
  }

  if (!rows || rows.length === 0) {
    return null;
  }

  const first = rows[0];

  if (
    first &&
    typeof first === "object" &&
    "id" in first &&
    typeof (first as ResendIdRow).id === "string"
  ) {
    return (first as ResendIdRow).id;
  }

  return null;
}

function buildNotificationText(
  input: SendCatalogueLicensingNotificationInput,
): string {
  const { submission, tracks, shareLink, enquiryId } = input;

  const trackLines = tracks.map((track, index) => {
    const artist = track.artistName ? ` — ${track.artistName}` : "";

    return `${index + 1}. ${track.recordingId} — ${
      track.title
    }${artist}`;
  });

  const sourceLines = shareLink
    ? [
        `Share link ID: ${shareLink.id}`,
        shareLink.label ? `Share label: ${shareLink.label}` : null,
        shareLink.recipientName
          ? `Link issued to: ${shareLink.recipientName}`
          : null,
        shareLink.recipientEmail
          ? `Issued recipient email: ${shareLink.recipientEmail}`
          : null,
      ].filter((value): value is string => value !== null)
    : ["Share attribution: none (fallback/direct catalogue access)"];

  const detailLines = [
    `Project / production: ${submission.projectName}`,
    `Requester: ${submission.requesterName}`,
    `Email: ${submission.requesterEmail}`,
    optionalLine("Company / agency", submission.company),
    `Medium / use: ${submission.mediumUse}`,
    `Territory: ${submission.territory}`,
    `Term / timeframe: ${submission.termTimeframe}`,
    `Rights needed: ${rightsRequestLabel(submission.rightsRequest)}`,
    optionalLine("Budget", submission.budget),
    optionalLine("Deadline", submission.deadline),
  ].filter((value): value is string => value !== null);

  return [
    "New catalogue licensing enquiry",
    "",
    ...detailLines,
    "",
    "Selected recordings:",
    ...trackLines,
    "",
    "Catalogue attribution:",
    ...sourceLines,
    ...(submission.notes.trim()
      ? ["", "Notes:", submission.notes.trim()]
      : []),
    "",
    `Enquiry ID: ${enquiryId}`,
  ].join("\n");
}

export async function sendCatalogueLicensingNotification(
  input: SendCatalogueLicensingNotificationInput,
): Promise<string> {
  const apiKey = requiredEnv("AFR_RESEND_API_KEY");

  const notifyTo =
    process.env.CATALOGUE_LICENSING_NOTIFY_TO?.trim() ||
    "licensing@angelfishrecords.com";

  const from =
    process.env.CATALOGUE_LICENSING_FROM?.trim() ||
    "Angelfish Records Catalogue <brendan@press.angelfishrecords.com>";

  const resend = new Resend(apiKey);

  const subject =
    `Licensing enquiry — ${input.submission.projectName}`.slice(0, 180);

  const idempotencyHash = crypto
    .createHash("sha256")
    .update(input.submission.clientRequestId)
    .digest("hex")
    .slice(0, 48);

  const idempotencyKey = `af-catalogue:${idempotencyHash}`;

  const result = await resend.batch.send(
    [
      {
        from,
        to: notifyTo,
        replyTo: input.submission.requesterEmail,
        subject,
        text: buildNotificationText(input),
        tags: [
          {
            name: "purpose",
            value: "catalogue-licensing",
          },
          {
            name: "enquiry_id",
            value: input.enquiryId,
          },
        ],
      },
    ],
    {
      idempotencyKey,
    },
  );

  const error = (result as { error?: unknown }).error;

  if (error) {
    throw new Error(`Resend notification failed: ${errorText(error)}`);
  }

  const dataUnknown = (result as { data?: unknown }).data;
  const resendId = firstResendId(dataUnknown);

  if (!resendId) {
    throw new Error(
      "Resend notification response did not include an email id",
    );
  }

  return resendId;
}
