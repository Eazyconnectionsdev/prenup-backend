import { registerDecorator, ValidationOptions } from 'class-validator';
import { isPossiblePhoneNumber } from 'libphonenumber-js';

// Numbers without a country code are read as Canadian.
const DEFAULT_REGION = 'CA';

export function isValidPhone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const cleaned = value.trim().replace(/[\s\-().]/g, '');
  if (!/^\+?[0-9]+$/.test(cleaned)) return false;
  return isPossiblePhoneNumber(cleaned, DEFAULT_REGION);
}

// Empty / missing values pass; combine with @IsOptional() as usual.
export function IsValidPhone(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidPhone',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid phone number (e.g. +14165550192)`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          value === '' || value === null || isValidPhone(value),
      },
    });
  };
}
