import { productionLogout } from '../../lib/crm/production.js';

export function POST(request) {
  return productionLogout(request);
}
