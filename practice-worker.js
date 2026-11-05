import { planPractice } from './practice-planner.js?v=practice-2';
self.onmessage=({data})=>{try{self.postMessage({result:planPractice(data.responses,data.settings)});}catch(error){self.postMessage({error:error.message});}};
