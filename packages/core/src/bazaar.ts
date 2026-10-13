import type { RouteSpec } from './types';

export function bazaarExtension(route: RouteSpec) {
  const isGet = route.method === 'GET';
  const inputProps = route.input.schema.properties ?? {};
  const required = route.input.schema.required ?? [];
  const input = isGet
    ? { type: 'http', method: 'GET', queryParams: route.example.input }
    : { type: 'http', method: route.method, bodyType: 'json', body: route.example.input };
  const inputSchema = isGet
    ? {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'http' },
          method: { type: 'string', enum: ['GET', 'HEAD', 'DELETE'] },
          queryParams: { type: 'object', properties: inputProps, required },
        },
        required: ['type', 'method'],
        additionalProperties: false,
      }
    : {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'http' },
          method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] },
          bodyType: { type: 'string', enum: ['json', 'form-data', 'text'] },
          body: { type: 'object', properties: inputProps, required },
        },
        required: ['type', 'method', 'bodyType', 'body'],
        additionalProperties: false,
      };
  return {
    bazaar: {
      info: { input, output: { type: 'json', example: route.example.output } },
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          input: inputSchema,
          output: {
            type: 'object',
            properties: { type: { type: 'string' }, example: route.output },
            required: ['type'],
          },
        },
        required: ['input'],
      },
    },
  };
}
