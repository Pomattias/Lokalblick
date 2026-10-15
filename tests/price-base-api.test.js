import test from "node:test";
import assert from "node:assert/strict";
import {extractPriceBase} from "../api/price-base.js";
test("read exact year from JSON-stat2 without confusing enhanced price base",()=>{
 const dataset={id:["Tid","ContentsCode"],size:[3,1],dimension:{
  Tid:{category:{index:{"2025":0,"2026":1,"2027":2}}},
  ContentsCode:{category:{index:{"PR0101A1":0}}}
 },value:[58800,59200,59600]};
 assert.equal(extractPriceBase(dataset,2027),59600);
 assert.equal(extractPriceBase(dataset,2026),59200);
 assert.throws(()=>extractPriceBase(dataset,2028),/inget fastställt/);
});
test("reject multiple measures and invalid figures",()=>{
 const dataset={id:["Tid","ContentsCode"],size:[1,2],dimension:{
  Tid:{category:{index:{"2027":0}}},
  ContentsCode:{category:{index:{"PR0101A1":0,"PR0101D1":1}}}
 },value:[59600,60900]};
 assert.throws(()=>extractPriceBase(dataset,2027),/flera olika mått/);
});

test("single time dimension is allowed for the official annual figure",()=>{
 const dataset={id:["Tid"],size:[2],dimension:{Tid:{category:{index:{"2026":0,"2027":1}}}},value:[59200,59600]};
 assert.equal(extractPriceBase(dataset,2026),59200);
});
