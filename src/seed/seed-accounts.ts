// Accounts created by SeedService when the database has no users.
// Emails are lowercase because the User schema lowercases them on save.

export interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
}

export interface SeedLawyer extends SeedUser {
  externalId: string;
}

export interface SeedCompany {
  name: string;
  companyNumber: string;
  email: string;
  lawyers: SeedLawyer[];
}

export const SEED_ADMINS: SeedUser[] = [
  { email: 'admin1@lp.com', firstName: 'Admin', lastName: '1' },
  { email: 'admin2@lp.com', firstName: 'Admin', lastName: '2' },
];

export const SEED_CASE_MANAGERS: SeedUser[] = [
  { email: 'cm1@lp.com', firstName: 'Case Manager', lastName: '1' },
  { email: 'cm2@lp.com', firstName: 'Case Manager', lastName: '2' },
  { email: 'cm3@lp.com', firstName: 'Case Manager', lastName: '3' },
];

// Fills the fields the admin company form requires, so seeded companies are
// complete when opened for editing. (Phone needs a +country code to validate.)
export const SEED_COMPANY_DETAILS = {
  companyType: 'Limited company',
  status: 'active',
  phone: '+442079460958',
  addressLine1: '1 Test Street',
  city: 'London',
  postcode: 'EC1A 1BB',
  country: 'United Kingdom',
  address: '1 Test Street, London, EC1A 1BB, United Kingdom',
};

// A company is only a record lawyers belong to; the app has no company login.
export const SEED_COMPANIES: SeedCompany[] = [1, 2, 3].map((n) => ({
  name: `Company ${n}`,
  companyNumber: `LP-C${n}`,
  email: `Company${n}@lp.com`,
  lawyers: [1, 2].map((l) => ({
    email: `l${l}c${n}@lp.com`,
    externalId: `L${l}C${n}`,
    firstName: 'Lawyer',
    lastName: `${l} Company ${n}`,
  })),
}));
