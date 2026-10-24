import { productionCrm } from '../../lib/crm/production.js';

const handle = (request) => productionCrm(request);

export { handle as GET, handle as POST, handle as PATCH, handle as OPTIONS };
