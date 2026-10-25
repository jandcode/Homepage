import { productionPortalAuth } from '../../../lib/portal/production.js';

const handle = (request, context) => {
  const action = context?.params?.action || '';
  return productionPortalAuth(action, request);
};

export { handle as GET, handle as POST };
