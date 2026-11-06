/* eslint-disable */
/**
 * Seeds the companies and lawyers the couple choose from on
 * /dashboard/lawyer-selection.
 *
 * SeedService only creates these while the users collection is empty, so a
 * database that kept its users but lost its companies/lawyers has nothing to
 * pick from. This script fills that gap on its own.
 *
 * It matches SEED_COMPANIES in src/seed/seed-accounts.ts: three companies with
 * two lawyers each, keyed on the company's email and the lawyer's externalId,
 * and linked to the l<n>c<n>@lp.com user accounts when those exist. Re-running
 * it updates the same six records instead of adding more.
 *
 *   node scripts/seed-lawyers.js            # mongodb://localhost:27017
 *   MONGODB_URI=... node scripts/seed-lawyers.js
 */

const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

function readEnvUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    const match = /^MONGODB_URI=(.*)$/m.exec(env);
    if (match) return match[1].trim();
  } catch {
    // no .env; fall through to the default
  }
  return "mongodb://localhost:27017";
}

const COMPANY_DETAILS = {
  companyType: "Limited company",
  status: "active",
  regulatoryBody: "Solicitors Regulation Authority",
  phone: "+442079460958",
  addressLine1: "1 Test Street",
  city: "London",
  postcode: "EC1A 1BB",
  country: "United Kingdom",
  address: "1 Test Street, London, EC1A 1BB, United Kingdom",
  notes: "Test company seeded for QA",
};

// The three price shapes the case manager's "next steps" email describes.
const PRICE_TEXTS = [
  "£300 including VAT",
  "£300 + VAT",
  "£300 (VAT exempt)",
];

const COMPANIES = [1, 2, 3].map((n) => ({
  name: `Company ${n}`,
  companyNumber: `LP-C${n}`,
  email: `Company${n}@lp.com`,
  regulatoryNumber: `SRA-${600000 + n}`,
  website: `https://company${n}.example.com`,
  description: `Family law practice seeded for testing (Company ${n}).`,
  lawyers: [1, 2].map((l) => ({
    externalId: `L${l}C${n}`,
    email: `l${l}c${n}@lp.com`,
    firstName: "Lawyer",
    lastName: `${l} Company ${n}`,
    jobTitle: l === 1 ? "Partner, Family Law" : "Senior Associate, Family Law",
    registrationNumber: `SRA-${700000 + n * 10 + l}`,
    priceText: PRICE_TEXTS[(n + l) % PRICE_TEXTS.length],
    phone: `+4420794609${n}${l}`,
  })),
}));

(async () => {
  const uri = readEnvUri();
  const client = new MongoClient(uri);
  await client.connect();

  // The URI carries no database name in this project, so mongoose lands on
  // the driver's default. db() resolves the same way.
  const db = client.db();
  const companies = db.collection("companies");
  const lawyers = db.collection("lawyers");
  const users = db.collection("users");

  console.log(`Seeding lawyers into "${db.databaseName}" (${uri})`);

  let companyCount = 0;
  let lawyerCount = 0;
  const missingUsers = [];

  for (const c of COMPANIES) {
    const now = new Date();
    await companies.updateOne(
      { email: c.email },
      {
        $set: {
          name: c.name,
          companyNumber: c.companyNumber,
          regulatoryNumber: c.regulatoryNumber,
          website: c.website,
          description: c.description,
          verified: true,
          ...COMPANY_DETAILS,
          updatedAt: now,
        },
        $setOnInsert: { email: c.email, documents: [], createdAt: now },
      },
      { upsert: true },
    );
    const company = await companies.findOne({ email: c.email });
    companyCount++;

    for (const l of c.lawyers) {
      const user = await users.findOne({ email: l.email });
      if (!user) missingUsers.push(l.email);

      const link = user
        ? { user: user._id, userId: user._id }
        : { userId: null };

      await lawyers.updateOne(
        { externalId: l.externalId },
        {
          $set: {
            name: `${l.firstName} ${l.lastName}`,
            firstName: l.firstName,
            lastName: l.lastName,
            company: company._id,
            officeBranch: "London",
            jobTitle: l.jobTitle,
            status: "available",
            regulatoryBody: "Solicitors Regulation Authority",
            registrationNumber: l.registrationNumber,
            barNumber: l.registrationNumber,
            practisingStatus: "Practising",
            jurisdiction: "England & Wales",
            qualifications: "LLB (Hons), Solicitor of England & Wales",
            priceText: l.priceText,
            workEmail: l.email,
            publicEmail: l.email,
            directEmail: l.email,
            workPhone: l.phone,
            publicPhone: l.phone,
            directPhone: l.phone,
            address: COMPANY_DETAILS.address,
            website: c.website,
            verified: true,
            notes: "Test lawyer seeded for QA",
            createdBy: "seed-lawyers script",
            invitationStatus: "not_sent",
            updatedAt: new Date(),
            ...link,
          },
          $setOnInsert: {
            externalId: l.externalId,
            documents: [],
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );

      const lawyer = await lawyers.findOne({ externalId: l.externalId });
      lawyerCount++;

      // The lawyer portal reads Lawyer.user; the admin flow reads
      // User.lawyerProfile. Keep both pointing at each other.
      if (user) {
        await users.updateOne(
          { _id: user._id },
          { $set: { lawyerProfile: lawyer._id } },
        );
      }
    }
  }

  console.log(`Done: ${companyCount} companies, ${lawyerCount} lawyers.`);
  if (missingUsers.length) {
    console.log(
      `No user account for: ${missingUsers.join(", ")} — the lawyer records ` +
        `exist and are selectable, but those solicitors cannot sign in until ` +
        `the accounts are created.`,
    );
  }

  await client.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
