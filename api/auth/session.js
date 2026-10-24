import { productionSession } from '../../lib/crm/production.js';

export function GET(request) {
  return productionSession(request);
}
