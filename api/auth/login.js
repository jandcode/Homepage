import { productionLogin } from '../../lib/crm/production.js';

export function POST(request) {
  return productionLogin(request);
}
