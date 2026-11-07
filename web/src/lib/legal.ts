import { BRAND } from './config';

// Business details shown on the Privacy, Terms, Refunds and Contact pages. Payment and sign-in
// reviewers (Cashfree, Google) compare these with your KYC, so use the exact registered name and
// address. An empty field is left out of the pages rather than shown as a placeholder.
export const BUSINESS = {
  legalName: '', // registered business or proprietor name
  address: '', // street address
  cityStatePin: '', // e.g. "Hyderabad, Telangana 500081"
  gstin: '',
  phone: '',
  grievanceOfficer: '', // person responsible for privacy and grievance requests
  courtsCity: '' // city whose courts have jurisdiction under the Terms
};

/** Who provides the service: the registered name once it is filled in, else the brand. */
export const OPERATOR = BUSINESS.legalName || BRAND;

export const POLICY_UPDATED = '8 November 2026';
