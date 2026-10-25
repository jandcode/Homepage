import { productionPortal } from '../../lib/portal/production.js';

const handle = (request) => productionPortal(request);

export { handle as GET, handle as POST, handle as PATCH, handle as OPTIONS };
