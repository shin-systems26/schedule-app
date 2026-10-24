import { planSplit } from './split-planner.js?v=conditional-1';
self.onmessage = ({ data }) => {
  try { self.postMessage({ result: planSplit(data.responses, data.group, data.settings) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
