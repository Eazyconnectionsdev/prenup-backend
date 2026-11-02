// Same reason as company.schema.ts: the admin and cases modules share one
// "Lawyer" model and Mongoose keeps whichever schema registers first, so this
// re-exports the cases schema instead of declaring a second, diverging one.
export * from '../../cases/schemas/lawyer.schema';
