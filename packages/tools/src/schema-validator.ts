/**
 * JSON Schema validator.
 *
 * A deliberately focused implementation covering the keywords the tool
 * catalogue actually uses: `type`, `required`, `properties`,
 * `additionalProperties`, `items`, `enum`, `const`, `minimum`/`maximum`,
 * `minLength`/`maxLength`, and a light `format` check. This is what lets the
 * runtime validate a tool's input before execution and its output after,
 * without pulling in a heavyweight schema engine.
 *
 * It is intentionally lenient about keywords it does not recognise -- an
 * unknown keyword is ignored rather than rejected -- so a richer schema still
 * validates its supported parts instead of failing outright.
 */

export type JsonSchema = Record<string, unknown>;

export interface ValidationIssue {
  /** JSON-pointer-ish path to the offending value, e.g. `/query`. */
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
}

const TYPE_NAMES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'] as const;
type TypeName = (typeof TYPE_NAMES)[number];

function typeOf(value: unknown): TypeName {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return 'object';
}

/** `integer` satisfies `number`; otherwise the names must match. */
function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function checkFormat(value: string, format: string): boolean {
  switch (format) {
    case 'uri':
    case 'url':
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'uuid':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    case 'date-time':
      return !Number.isNaN(Date.parse(value));
    default:
      // Unknown formats are advisory only.
      return true;
  }
}

function validateNode(schema: JsonSchema, value: unknown, path: string, errors: ValidationIssue[]): void {
  // `const` and `enum` first: they constrain the value regardless of type.
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) {
    errors.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((option) => JSON.stringify(option) === JSON.stringify(value))) {
    errors.push({ path, message: `must be one of ${schema.enum.map((o) => JSON.stringify(o)).join(', ')}` });
    return;
  }

  if (typeof schema.type === 'string' && !matchesType(value, schema.type)) {
    errors.push({ path, message: `expected ${schema.type}, got ${typeOf(value)}` });
    return;
  }

  if (Array.isArray(schema.type) && !schema.type.some((type) => matchesType(value, String(type)))) {
    errors.push({ path, message: `expected one of ${schema.type.join(', ')}, got ${typeOf(value)}` });
    return;
  }

  const kind = typeOf(value);

  if (kind === 'string') validateString(schema, value as string, path, errors);
  else if (kind === 'number' || kind === 'integer') validateNumber(schema, value as number, path, errors);
  else if (kind === 'array') validateArray(schema, value as unknown[], path, errors);
  else if (kind === 'object') validateObject(schema, value as Record<string, unknown>, path, errors);
}

function validateString(schema: JsonSchema, value: string, path: string, errors: ValidationIssue[]): void {
  if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
    errors.push({ path, message: `must be at least ${schema.minLength} characters` });
  }
  if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
    errors.push({ path, message: `must be at most ${schema.maxLength} characters` });
  }
  if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
    errors.push({ path, message: `must match ${schema.pattern}` });
  }
  if (typeof schema.format === 'string' && !checkFormat(value, schema.format)) {
    errors.push({ path, message: `must be a valid ${schema.format}` });
  }
}

function validateNumber(schema: JsonSchema, value: number, path: string, errors: ValidationIssue[]): void {
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push({ path, message: `must be >= ${schema.minimum}` });
  }
  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    errors.push({ path, message: `must be <= ${schema.maximum}` });
  }
}

function validateArray(schema: JsonSchema, value: unknown[], path: string, errors: ValidationIssue[]): void {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    errors.push({ path, message: `must have at least ${schema.minItems} items` });
  }
  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    errors.push({ path, message: `must have at most ${schema.maxItems} items` });
  }
  if (schema.items && typeof schema.items === 'object') {
    value.forEach((item, index) =>
      validateNode(schema.items as JsonSchema, item, `${path}/${index}`, errors),
    );
  }
}

function validateObject(
  schema: JsonSchema,
  value: Record<string, unknown>,
  path: string,
  errors: ValidationIssue[],
): void {
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const key of required) {
    if (!(key in value) || value[key] === undefined) {
      errors.push({ path: `${path}/${key}`, message: 'is required' });
    }
  }

  const properties = (schema.properties as Record<string, JsonSchema> | undefined) ?? {};
  for (const [key, childSchema] of Object.entries(properties)) {
    if (key in value && value[key] !== undefined) {
      validateNode(childSchema, value[key], `${path}/${key}`, errors);
    }
  }

  // `additionalProperties: false` rejects keys the schema does not describe.
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        errors.push({ path: `${path}/${key}`, message: 'is not an allowed property' });
      }
    }
  }
}

/** Validates a value against a JSON Schema document. */
export function validateAgainstSchema(schema: JsonSchema, value: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  validateNode(schema ?? {}, value, '', errors);
  return { valid: errors.length === 0, errors };
}
