// The admin and cases modules share one "Company" model, and Mongoose keeps
// whichever schema registers first. A second definition here would silently drop
// fields, so this re-exports the cases schema instead of declaring its own.
export * from '../../cases/schemas/company.schema';
