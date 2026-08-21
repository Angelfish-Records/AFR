export type CatalogueLicensingRightsRequest =
  | "full_sync"
  | "master_only";

export type CatalogueLicensingEnquiryRequest = {
  clientRequestId: string;
  recordingIds: string[];
  requesterName: string;
  requesterEmail: string;
  company: string;
  projectName: string;
  mediumUse: string;
  territory: string;
  termTimeframe: string;
  rightsRequest: CatalogueLicensingRightsRequest;
  budget: string;
  deadline: string;
  notes: string;
};

export type CatalogueLicensingEnquiryResponse =
  | {
      ok: true;
      enquiryId: string;
    }
  | {
      ok: false;
      error: string;
      persisted?: boolean;
    };
