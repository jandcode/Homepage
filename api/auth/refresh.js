import { productionRefresh } from '../../lib/crm/production.js';

export function GET(request) {
  return productionRefresh(request);
}