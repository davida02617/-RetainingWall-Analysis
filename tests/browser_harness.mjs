import {analyze,presets} from '../browser/engine.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const cases=JSON.parse(input);
console.log(JSON.stringify({presets:presets(),results:cases.map(w=>{try{return {result:analyze(w)};}catch(e){return {error:e.message};}})}));
